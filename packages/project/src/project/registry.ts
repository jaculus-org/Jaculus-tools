import path from "path";
import pako from "pako";
import { createRequire } from "module";
import semver from "semver";
import { FSInterface, getRequestJson, RequestFunction } from "../fs/index.js";
import { PackageJson, parsePackageJson } from "./package.js";

// there is some bug in the tar-browserify library
// The requested module '@obsidize/tar-browserify' does not provide an export named 'Archive'
// solution is to use the createRequire function to require the library
const require = createRequire(import.meta.url);
const { Archive } = require("@obsidize/tar-browserify");

export class Registry {
    public constructor(
        public registryUri: string[],
        public getRequest: RequestFunction
    ) {}

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

    public async extractPackage(
        packageData: Uint8Array,
        fs: FSInterface,
        extractionRoot: string
    ): Promise<void> {
        if (!fs.existsSync(extractionRoot)) {
            fs.mkdirSync(extractionRoot, { recursive: true });
        }

        for await (const entry of Archive.read(pako.ungzip(packageData))) {
            // archive entries are prefixed with "package/" -> skip that part
            if (!entry.fileName.startsWith("package/")) {
                continue;
            }
            const relativePath = entry.fileName.substring("package/".length);
            if (!relativePath) {
                continue;
            }

            const fullPath = path.join(extractionRoot, relativePath);

            if (entry.isDirectory()) {
                if (!fs.existsSync(fullPath)) {
                    fs.mkdirSync(fullPath, { recursive: true });
                }
            } else if (entry.isFile()) {
                const dirPath = path.dirname(fullPath);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
                fs.writeFileSync(fullPath, entry.content!);
            }
        }
    }

    // private helper to try registries one by one until one succeeds

    private async retrieveSingleResultFromRegistries<T>(
        action: (uri: string) => Promise<T>,
        errorMessage: string
    ): Promise<T> {
        for (const uri of this.registryUri) {
            try {
                const result = await action(uri);
                return result;
            } catch {
                // ignore errors
            }
        }
        throw new Error(errorMessage);
    }
}
