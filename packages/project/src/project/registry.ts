import semver from "semver";
import { getRequestJson, RequestFunction } from "../fs/index.js";
import { PackageJson, parsePackageJson } from "./package.js";
import * as z from "zod";

export const DefaultRegistryUrl = ["https://registry.jaculus.org"];

/**
 *
 * Registry dist structure:
 *  outputRegistryDist/
 *   |-- packageName/
 *   |    |-- version/
 *   |    |   |-- package.tar.gz
 *   |    |   |-- package.json (same as in package)
 *	 |-- versions.json (list of versions) [{"version":"0.0.24"},{"version":"0.0.25"}]
 * 	 |-- list.json (list of packages) [{"id":"core"},{"id":"smart-led"}]
 *
 *
 * package.tar.gz contains:
 *   package/
 *     |-- dist/
 *     |-- blocks/
 *     |-- package.json
 *     |-- README.md
 */

const ProjectTypeSchema = z.enum(["code", "jacly"]);
export type ProjectType = z.infer<typeof ProjectTypeSchema>;

const RegistryListSchema = z.array(
    z.object({
        id: z.string(),
        projectType: ProjectTypeSchema.optional(),
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
    private packageJsonCache: Map<string, PackageJson> = new Map();
    private pendingRequests: Map<string, Promise<PackageJson>> = new Map();

    private constructor(
        registryUri: string[],
        public getRequest: RequestFunction
    ) {
        this.registryUri = registryUri;
    }

    /**
     * Create a new Registry instance with validated registry URIs.
     * Use this instead of the constructor.
     */
    public static async create(
        registryUri: string[] | undefined,
        getRequest: RequestFunction
    ): Promise<Registry> {
        const validatedUri = await Registry.validateRegistry(
            registryUri ?? DefaultRegistryUrl,
            getRequest
        );
        return new Registry(validatedUri, getRequest);
    }

    /**
     * Validate registry URIs by checking if they are available.
     * Returns only valid registry URIs.
     */
    private static async validateRegistry(
        registryUri: string[],
        getRequest: RequestFunction
    ): Promise<string[]> {
        const validRegistryUri: string[] = [];
        for (const uri of registryUri) {
            try {
                await getRequest(uri, "");
                validRegistryUri.push(uri);
            } catch (error) {
                console.error(`Registry ${uri} is not available: ${error}`);
            }
        }
        return validRegistryUri;
    }

    public async listPackages(): Promise<string[]> {
        const items = await this.fetchRegistryItems();
        return items.filter((item) => !item.isTemplate).map((item) => item.id);
    }

    public async listTemplates(projectType?: ProjectType): Promise<string[]> {
        const items = await this.fetchRegistryItems();
        return items
            .filter((item) => item.isTemplate && (!projectType || item.projectType === projectType))
            .map((item) => item.id);
    }

    private async fetchRegistryItems(): Promise<RegistryList> {
        try {
            // map to store all items and their data
            const allItems: Map<string, RegistryList[0]> = new Map();

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
                } catch {
                    // silently catch
                }
            }

            return Array.from(allItems.values());
        } catch (error) {
            throw new Error(`Failed to fetch library list from registries: ${error}`);
        }
    }

    public async exists(library: string): Promise<boolean> {
        return this.retrieveSingleResultFromRegistries(
            (uri) =>
                getRequestJson(this.getRequest, uri, `${library}/versions.json`).then(() => true),
            `Library '${library}' not found`
        ).catch(() => false);
    }

    public async listVersions(library: string): Promise<string[]> {
        const versions = await this.retrieveSingleResultFromRegistries(async (uri) => {
            return getRequestJson(this.getRequest, uri, `${library}/versions.json`);
        }, `Failed to fetch versions for library '${library}'`);
        return parseRegistryVersions(versions)
            .map((item) => item.version)
            .sort(semver.rcompare);
    }

    /**
     * Get package.json for a specific version of a library.
     * This method uses caching and pending requests pattern to avoid duplicate requests.
     *
     * @param library The name of the library.
     * @param version The version of the library.
     * @returns The package.json for the specified version.
     */
    public async getPackageJson(library: string, version: string): Promise<PackageJson> {
        const cacheKey = `${library}@${version}`;

        // Check cache first
        const cached = this.packageJsonCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // Check if there's already a pending request for this package
        const pending = this.pendingRequests.get(cacheKey);
        if (pending) {
            return pending;
        }

        // Create the request promise and store it
        const requestPromise = (async () => {
            const path = `${library}/${version}/package.json`;
            const json = await this.retrieveSingleResultFromRegistries(async (uri) => {
                return getRequestJson(this.getRequest, uri, path);
            }, `Failed to fetch package.json for library '${library}' version '${version}'`);
            const result = parsePackageJson(json, path);
            this.packageJsonCache.set(cacheKey, result);
            return result;
        })();

        this.pendingRequests.set(cacheKey, requestPromise);

        try {
            return await requestPromise;
        } finally {
            // Clean up pending request after completion
            this.pendingRequests.delete(cacheKey);
        }
    }

    public async getPackageTgz(library: string, version: string): Promise<Uint8Array> {
        return this.retrieveSingleResultFromRegistries(async (uri) => {
            return this.getRequest(uri, `${library}/${version}/package.tar.gz`);
        }, `Failed to fetch package.tar.gz for library '${library}' version '${version}'`);
    }

    private async retrieveSingleResultFromRegistries<T>(
        action: (uri: string) => Promise<T>,
        errorMessage: string
    ): Promise<T> {
        for (const uri of this.registryUri) {
            try {
                const result = await action(uri);
                return result;
            } catch {
                // try next registry
            }
        }
        throw new Error(errorMessage);
    }
}
