import path from "path";
import { Writable } from "stream";
import { FSInterface, RequestFunction } from "../fs/index.js";
import { Registry } from "./registry.js";
import {
    parsePackageJson,
    loadPackageJson,
    savePackageJson,
    RegistryUris,
    Dependencies,
    Dependency,
    JacLyFiles,
    PackageJson,
} from "./package.js";

export const DefaultRegistryUrl = ["https://f.jaculus.org/libs"];

export interface ProjectPackage {
    dirs: string[];
    files: Record<string, Uint8Array>;
}

export class Project {
    constructor(
        public fs: FSInterface,
        public projectPath: string,
        public out: Writable,
        public err: Writable,
        public uriRequest?: RequestFunction
    ) {}

    async unpackPackage(
        pkg: ProjectPackage,
        filter: (fileName: string) => boolean,
        dryRun: boolean = false
    ): Promise<void> {
        for (const dir of pkg.dirs) {
            const source = dir;
            const fullPath = path.join(this.projectPath, source);
            if (!this.fs.existsSync(fullPath) && !dryRun) {
                this.err.write(`Create directory: ${fullPath}\n`);
                await this.fs.promises.mkdir(fullPath, { recursive: true });
            }
        }

        for (const [fileName, data] of Object.entries(pkg.files)) {
            const source = fileName;

            if (!filter(source)) {
                this.out.write(`[skip] ${source}\n`);
                continue;
            }
            const fullPath = path.join(this.projectPath, source);

            const exists = this.fs.existsSync(fullPath);
            this.out.write(
                `${dryRun ? "[dry-run] " : ""}${exists ? "Overwrite" : "Create"} ${fullPath}\n`
            );

            if (!dryRun) {
                const dir = path.dirname(fullPath);
                if (!this.fs.existsSync(dir)) {
                    await this.fs.promises.mkdir(dir, { recursive: true });
                }
                await this.fs.promises.writeFile(fullPath, data);
            }
        }
    }

    async createFromPackage(pkg: ProjectPackage, dryRun: boolean = false): Promise<void> {
        if (this.fs.existsSync(this.projectPath)) {
            this.err.write(`Directory '${this.projectPath}' already exists\n`);
            throw 1;
        }

        const filter = (fileName: string): boolean => {
            if (fileName === "manifest.json") {
                return false;
            }
            return true;
        };

        await this.unpackPackage(pkg, filter, dryRun);
    }

    async updateFromPackage(pkg: ProjectPackage, dryRun: boolean = false): Promise<void> {
        if (!this.fs.existsSync(this.projectPath)) {
            this.err.write(`Directory '${this.projectPath}' does not exist\n`);
            throw 1;
        }

        if (!this.fs.statSync(this.projectPath).isDirectory()) {
            this.err.write(`Path '${this.projectPath}' is not a directory\n`);
            throw 1;
        }

        let manifest;
        if (pkg.files["manifest.json"]) {
            manifest = JSON.parse(new TextDecoder().decode(pkg.files["manifest.json"]));
        }

        let skeleton: string[];
        if (!manifest || !manifest["skeletonFiles"]) {
            skeleton = ["@types/*", "tsconfig.json"];
        } else {
            const input = manifest["skeletonFiles"];
            skeleton = [];
            for (const entry of input) {
                if (typeof entry === "string") {
                    skeleton.push(entry);
                } else {
                    this.err.write(`Invalid skeleton entry: ${JSON.stringify(entry)}\n`);
                    throw 1;
                }
            }
        }

        const filter = (fileName: string): boolean => {
            if (fileName === "manifest.json") {
                return false;
            }
            for (const pattern of skeleton) {
                if (path.matchesGlob(fileName, pattern)) {
                    return true;
                }
            }
            return false;
        };

        await this.unpackPackage(pkg, filter, dryRun);
    }

    async install(): Promise<void> {
        this.out.write("Installing project dependencies...\n");

        const pkg = await loadPackageJson(this.fs, this.projectPath, "package.json");
        const resolvedDeps = await this.resolveDependencies(pkg.registry, pkg.dependencies);
        await this.installDependencies(pkg.registry, resolvedDeps);
    }

    async addLibraryVersion(library: string, version: string): Promise<void> {
        this.out.write(`Adding library '${library}' to project...\n`);
        const pkg = await loadPackageJson(this.fs, this.projectPath, "package.json");
        const addedDep = await this.addLibVersion(library, version, pkg.dependencies, pkg.registry);
        if (addedDep) {
            pkg.dependencies[addedDep.name] = addedDep.version;
            await savePackageJson(this.fs, this.projectPath, "package.json", pkg);
            this.out.write(`Successfully added library '${library}@${version}' to project\n`);
        } else {
            throw new Error(`Failed to add library '${library}@${version}' to project`);
        }
    }

    async addLibrary(library: string): Promise<void> {
        this.out.write(`Adding library '${library}' to project...\n`);
        const pkg = await loadPackageJson(this.fs, this.projectPath, "package.json");
        const baseDeps = await this.resolveDependencies(pkg.registry, { ...pkg.dependencies });

        const registry = await this.loadRegistry(pkg.registry);
        const versions = await registry.listVersions(library);

        for (const version of versions) {
            const addedDep = await this.addLibVersion(library, version, baseDeps, pkg.registry);
            if (addedDep) {
                pkg.dependencies[addedDep.name] = addedDep.version;
                await savePackageJson(this.fs, this.projectPath, "package.json", pkg);
                this.out.write(`Successfully added library '${library}@${version}' to project\n`);
                return;
            }
        }
        throw new Error(`Failed to add library '${library}' to project with any available version`);
    }

    async removeLibrary(library: string): Promise<void> {
        this.out.write(`Removing library '${library}' from project...\n`);
        const pkg = await loadPackageJson(this.fs, this.projectPath, "package.json");
        delete pkg.dependencies[library];
        await savePackageJson(this.fs, this.projectPath, "package.json", pkg);
        this.out.write(`Successfully removed library '${library}' from project\n`);
    }

    /// Private methods //////////////////////////////////////////
    private async loadRegistry(registryUris: RegistryUris | undefined): Promise<Registry> {
        if (!this.uriRequest) {
            throw new Error("URI request function not provided");
        }
        return new Registry(registryUris || DefaultRegistryUrl, this.uriRequest);
    }

    private async resolveDependencies(
        registryUris: RegistryUris | undefined,
        dependencies: Dependencies
    ): Promise<Dependencies> {
        const registry = await this.loadRegistry(registryUris);

        const resolvedDeps = { ...dependencies };
        const processedLibraries = new Set<string>();
        const queue: Array<Dependency> = [];

        // start with direct dependencies
        for (const [libName, libVersion] of Object.entries(resolvedDeps)) {
            queue.push({ name: libName, version: libVersion });
        }

        // process BFS for dependencies
        while (queue.length > 0) {
            const dep = queue.shift()!;

            // skip if already processed
            if (processedLibraries.has(dep.name)) {
                continue;
            }
            processedLibraries.add(dep.name);

            this.out.write(`Resolving library '${dep.name}' version '${dep.version}'...\n`);

            try {
                const packageJson = await registry.getPackageJson(dep.name, dep.version);

                // process each transitive dependency
                for (const [libName, libVersion] of Object.entries(packageJson.dependencies)) {
                    if (libName in resolvedDeps) {
                        // check for version conflicts - only allow exact matches
                        if (resolvedDeps[libName] !== libVersion) {
                            const errorMsg = `Version conflict for library '${libName}': requested '${libVersion}', already resolved '${resolvedDeps[libName]}'`;
                            this.err.write(`Error: ${errorMsg}\n`);
                            throw new Error(errorMsg);
                        }
                        // already resolved with same version, skip
                        continue;
                    }

                    // add new dependency and enqueue for processing
                    resolvedDeps[libName] = libVersion;
                    queue.push({ name: libName, version: libVersion });
                }
            } catch (error) {
                this.err.write(
                    `Failed to resolve dependencies for '${dep.name}@${dep.version}': ${error}\n`
                );
                throw new Error(`Dependency resolution failed for '${dep.name}@${dep.version}'`);
            }
        }

        this.out.write("All dependencies resolved successfully.\n");
        return resolvedDeps;
    }

    private async installDependencies(
        registryUris: RegistryUris | undefined,
        dependencies: Dependencies
    ): Promise<void> {
        const registry = await this.loadRegistry(registryUris);

        for (const [libName, libVersion] of Object.entries(dependencies)) {
            try {
                this.out.write(`Installing library '${libName}' version '${libVersion}'...\n`);
                const packageData = await registry.getPackageTgz(libName, libVersion);
                const installPath = path.join(this.projectPath, "node_modules", libName);
                await registry.extractPackage(packageData, this.fs, installPath);
                this.out.write(`Successfully installed '${libName}@${libVersion}'\n`);
            } catch (error) {
                const errorMsg = `Failed to install library '${libName}@${libVersion}': ${error}`;
                this.err.write(`${errorMsg}\n`);
                throw new Error(errorMsg);
            }
        }
        this.out.write("All dependencies installed successfully.\n");
    }

    private async addLibVersion(
        library: string,
        version: string,
        testedDeps: Dependencies,
        registryUris: RegistryUris | undefined
    ): Promise<Dependency | null> {
        const newDeps = { ...testedDeps, [library]: version };
        try {
            await this.resolveDependencies(registryUris, newDeps);
            return { name: library, version: version };
        } catch (error) {
            this.err.write(`Error adding library '${library}@${version}': ${error}\n`);
            return null;
        }
    }
}

export {
    Registry,
    Dependency,
    Dependencies,
    JacLyFiles,
    RegistryUris,
    PackageJson,
    parsePackageJson,
    loadPackageJson,
    savePackageJson,
};
