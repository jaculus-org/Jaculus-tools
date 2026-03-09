import semver from "semver";
import {
    parsePackageJson,
    PackageJson,
    JaculusProjectTypeSchema,
    JaculusProjectType,
} from "./package.js";
import * as z from "zod";
import { getRequestJson, JaculusRequestError, Logger, RequestFunction } from "@jaculus/common";

export const DefaultRegistryUrl = ["http://127.0.0.1:3737/", "https://registry.jaculus.org"];

/**
 *
 * Registry dist structure:
 *  Registry/
 * 	 |-- list.json (list of packages) [{"id":"core"},{"id":"smart-led"}]
 *   |-- <packageName>/
 *       |-- versions.json (list of versions) [{"version":"0.0.24"},{"version":"0.0.25"}]
 *       |-- <version>/
 *           |-- package.tar.gz
 *           |-- package.json (same as in package)
 *
 * package.tar.gz contains:
 *   package/
 *    |-- dist/
 *    |-- blocks/
 *    |-- package.json
 *    |-- README.md
 */

export class RegistryFetchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RegistryFetchError";
    }
}

const RegistryListSchema = z.array(
    z.object({
        id: z.string(),
        projectType: JaculusProjectTypeSchema.optional(),
        isTemplate: z.boolean().optional(),
    })
);

const RegistryVersionsSchema = z.array(
    z.object({
        version: z.string(),
    })
);

export type RegistryList = z.infer<typeof RegistryListSchema>;
export type RegistryVersions = z.infer<typeof RegistryVersionsSchema>;

export function parseRegistryList(json: object): RegistryList {
    const result = RegistryListSchema.safeParse(json);
    if (!result.success) {
        const pretty = z.prettifyError(result.error);
        throw new Error(`Invalid registry list format:\n${pretty}`);
    }
    return result.data;
}

export function parseRegistryVersions(json: object): RegistryVersions {
    const result = RegistryVersionsSchema.safeParse(json);
    if (!result.success) {
        const pretty = z.prettifyError(result.error);
        throw new Error(`Invalid registry versions format:\n${pretty}`);
    }
    return result.data;
}

export class Registry {
    public registryUri: string[];
    private _logger?: Logger;

    private constructor(
        registryUri: string[],
        public getRequest: RequestFunction,
        logger?: Logger
    ) {
        this.registryUri = registryUri;
        this._logger = logger;
    }

    /**
     * Create a new Registry instance with validated registry URIs.
     */
    public static async create(
        registryUri: string[] | undefined,
        getRequest: RequestFunction,
        logger?: Logger
    ): Promise<Registry> {
        const validatedUri = await Registry.validateRegistry(
            registryUri ?? DefaultRegistryUrl,
            getRequest,
            logger
        );
        return new Registry(validatedUri, getRequest, logger);
    }

    /**
     * Create a new Registry instance without validating registry URIs.
     */
    public static createWithoutValidation(
        registryUri: string[] | undefined,
        getRequest: RequestFunction,
        logger?: Logger
    ): Registry {
        return new Registry(registryUri ?? DefaultRegistryUrl, getRequest, logger);
    }

    /**
     * Validate registry URIs by checking if they are available.
     * Returns only valid registry URIs.
     */
    private static async validateRegistry(
        registryUri: string[],
        getRequest: RequestFunction,
        logger?: Logger
    ): Promise<string[]> {
        const validRegistryUri: string[] = [];
        for (const uri of registryUri) {
            try {
                await getRequest(uri, "");
                validRegistryUri.push(uri);
            } catch (error) {
                logger?.error(`Registry ${uri} is not available: ${error}`);
            }
        }
        return validRegistryUri;
    }

    public async listPackages(): Promise<string[]> {
        const items = await this.fetchRegistryItems();
        return items.filter((item) => !item.isTemplate).map((item) => item.id);
    }

    public async listTemplates(projectType?: JaculusProjectType): Promise<string[]> {
        const items = await this.fetchRegistryItems();
        return items
            .filter((item) => item.isTemplate && (!projectType || item.projectType === projectType))
            .map((item) => item.id);
    }

    private async fetchRegistryItems(): Promise<RegistryList> {
        const allItems: Map<string, RegistryList[0]> = new Map();
        let firstError: unknown;

        for (const uri of this.registryUri) {
            try {
                const libraries = parseRegistryList(
                    await getRequestJson(this.getRequest, uri, "list.json")
                );
                for (const item of libraries) {
                    if (!allItems.has(item.id)) {
                        allItems.set(item.id, item);
                    }
                }
            } catch (error) {
                firstError ??= error;
                this._logger?.error(`Failed to fetch list from registry ${uri}: ${error}`);
            }
        }

        if (allItems.size === 0) {
            if (firstError instanceof Error) {
                throw firstError;
            }
            throw new RegistryFetchError("Failed to fetch library list from registries");
        }

        return Array.from(allItems.values());
    }

    public async exists(library: string): Promise<boolean> {
        let firstError: unknown;

        for (const uri of this.registryUri) {
            try {
                await getRequestJson(this.getRequest, uri, `${library}/versions.json`);
                return true;
            } catch (error) {
                if (error instanceof JaculusRequestError) {
                    continue;
                }
                firstError ??= error;
            }
        }

        if (firstError instanceof Error) {
            throw firstError;
        }
        if (firstError !== undefined) {
            throw new RegistryFetchError(String(firstError));
        }

        return false;
    }

    public async listVersions(library: string): Promise<string[]> {
        const versions = await this.retrieveSingleResultFromRegistries(async (uri) => {
            return getRequestJson(this.getRequest, uri, `${library}/versions.json`);
        }, `Failed to fetch versions for library '${library}' from any registry`);
        return parseRegistryVersions(versions)
            .map((item) => item.version)
            .sort(semver.rcompare);
    }

    public async getPackageJson(library: string, version: string): Promise<PackageJson> {
        const path = `${library}/${version}/package.json`;
        const json = await this.retrieveSingleResultFromRegistries(async (uri) => {
            return getRequestJson(this.getRequest, uri, path);
        }, `Failed to fetch package.json for library '${library}' version '${version}' from any registry`);
        return parsePackageJson(json, path);
    }

    public async getPackageTgz(library: string, version: string): Promise<Uint8Array> {
        return this.retrieveSingleResultFromRegistries(async (uri) => {
            return this.getRequest(uri, `${library}/${version}/package.tar.gz`);
        }, `Failed to fetch package.tar.gz for library '${library}' version '${version}' from any registry`);
    }

    private async retrieveSingleResultFromRegistries<T>(
        action: (uri: string) => Promise<T>,
        errorMessage: string
    ): Promise<T> {
        let firstError: unknown;

        for (const uri of this.registryUri) {
            try {
                const result = await action(uri);
                return result;
            } catch (error) {
                firstError ??= error;
                // try next registry
            }
        }

        if (firstError instanceof Error) {
            throw firstError;
        }
        if (firstError !== undefined) {
            throw new RegistryFetchError(String(firstError));
        }

        throw new RegistryFetchError(errorMessage);
    }
}
