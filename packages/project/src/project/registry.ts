import semver from "semver";
import { getRequestJson, RequestFunction } from "../fs/index.js";
import { PackageJson, parsePackageJson } from "./package.js";
import * as z from "zod";

export const DefaultRegistryUrl = ["https://f.jaculus.org/libs"];


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


const RegistryListSchema = z.array(
    z.object({
        id: z.string(),
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

    public constructor(
        registryUri: string[] | undefined,
        public getRequest: RequestFunction
    ) {
        this.registryUri = registryUri ? registryUri : DefaultRegistryUrl;
    }

    public async list(): Promise<string[]> {
        try {
            // map to store all libraries and its source registry
            const allLibraries: Map<string, string> = new Map();

            for (const uri of this.registryUri) {
                const libraries = parseRegistryList(await getRequestJson(this.getRequest, uri, "list.json"));
                for (const item of libraries) {
                    if (allLibraries.has(item.id)) {
                        throw new Error(
                            `Duplicate library ID '${item.id}' found in registry '${uri}'. Previously defined in registry '${allLibraries.get(item.id)}'`
                        );
                    }
                    allLibraries.set(item.id, uri);
                }
            }

            return Array.from(allLibraries.keys());
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
        return parseRegistryVersions(versions).map((item) => item.version).sort(semver.rcompare);
    }

    public async getPackageJson(library: string, version: string): Promise<PackageJson> {
        const json = await this.retrieveSingleResultFromRegistries(async (uri) => {
            return getRequestJson(this.getRequest, uri, `${library}/${version}/package.json`);
        }, `Failed to fetch package.json for library '${library}' version '${version}'`);
        return parsePackageJson(json);
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
                // Try next registry
            }
        }
        throw new Error(errorMessage);
    }
}
