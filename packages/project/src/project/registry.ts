import semver from "semver";
import { getRequestJson, RequestFunction } from "../fs/index.js";
import { PackageJson, parsePackageJson } from "./package.js";

export const DefaultRegistryUrl = ["https://f.jaculus.org/libs"];

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
                const libraries = await getRequestJson(this.getRequest, uri, "list.json");
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
        return this.retrieveSingleResultFromRegistries(async (uri) => {
            const data = await getRequestJson(this.getRequest, uri, `${library}/versions.json`);
            return data.map((item: any) => item.version).sort(semver.rcompare);
        }, `Failed to fetch versions for library '${library}'`);
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
