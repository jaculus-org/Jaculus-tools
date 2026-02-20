import path from "path";
import { Writable } from "stream";
import { extractTgzPackage, FSInterface, traverseDirectory } from "./fs.js";
import { Registry } from "./registry.js";
import {
    loadPackageJson,
    savePackageJson,
    Dependencies,
    DependencyObject,
    PackageJson,
    getPackagePath,
} from "./package.js";

export type ResolvedDependencies = Dependencies;
type DataSourceType = "registry" | "local";

export interface ProjectPackage {
    dirs: string[];
    files: Record<string, Uint8Array>;
}

export interface JaclyBlocksFiles {
    [filePath: string]: object;
}

export interface JaclyBlocksTranslations {
    [key: string]: string;
}

export interface JaclyBlocksData {
    blockFiles: JaclyBlocksFiles;
    translations: JaclyBlocksTranslations;
}

export class ProjectError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProjectError";
    }
}

export class ProjectDependencyError extends ProjectError {
    constructor(
        message: string,
        public readonly conflictingLib?: string,
        public readonly requested?: string,
        public readonly resolved?: string
    ) {
        super(message);
        this.name = "ProjectDependencyError";
    }
}

export class Project {
    constructor(
        public fs: FSInterface,
        public projectPath: string,
        public out: Writable,
        public err: Writable,
        public registry?: Registry
    ) {}

    private async unpackPackage(
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

    async createFromPackage(
        pkg: ProjectPackage,
        dryRun: boolean = false,
        validateFolder: boolean = true
    ): Promise<void> {
        if (validateFolder && !dryRun && this.fs.existsSync(this.projectPath)) {
            throw new ProjectError(`Directory '${this.projectPath}' already exists`);
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
            throw new ProjectError(`Directory '${this.projectPath}' does not exist`);
        }

        if (!this.fs.statSync(this.projectPath).isDirectory()) {
            throw new ProjectError(`Path '${this.projectPath}' is not a directory`);
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
                    throw new ProjectError(`Invalid skeleton entry: ${JSON.stringify(entry)}`);
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

    async loadProjectPackageJson(): Promise<PackageJson> {
        return loadPackageJson(this.fs, path.join(this.projectPath, "package.json"));
    }

    async saveProjectPackageJson(pkg: PackageJson): Promise<void> {
        await savePackageJson(this.fs, path.join(this.projectPath, "package.json"), pkg);
    }

    async installedLibraries(
        includeResolvedDependencies: boolean = false
    ): Promise<Dependencies | ResolvedDependencies> {
        const pkg = await this.loadProjectPackageJson();
        if (!includeResolvedDependencies) {
            return pkg.dependencies;
        }
        return await this.resolveDependencies(pkg.dependencies, "registry");
    }

    async install(): Promise<Dependencies> {
        if (!this.registry) {
            throw new ProjectError("Registry is not defined for the project");
        }
        this.out.write("Resolving project dependencies...\n");
        const pkg = await this.loadProjectPackageJson();
        const resolvedDeps = await this.resolveDependencies(pkg.dependencies, "registry");
        await this.installDependencies(resolvedDeps);
        return pkg.dependencies;
    }

    async addLibraryVersion(library: string, version: string): Promise<Dependencies> {
        if (!this.registry) {
            throw new ProjectError("Registry is not defined for the project");
        }
        if (!(await this.registry?.exists(library))) {
            throw new ProjectError(`Library '${library}' does not exist in the registry`);
        }

        this.out.write(`Adding library '${library}@${version}' to project.\n`);
        const pkg = await this.loadProjectPackageJson();
        const resolvedDependencies = await this.addLibVersion(library, version, pkg.dependencies);
        pkg.dependencies[library] = version;
        await this.saveProjectPackageJson(pkg);
        await this.installDependencies(resolvedDependencies);
        return pkg.dependencies;
    }

    async addLibrary(library: string): Promise<Dependencies> {
        if (!this.registry) {
            throw new ProjectError("Registry is not defined for the project");
        }
        this.out.write(`Adding library '${library}' to project.\n`);
        if (!(await this.registry?.exists(library))) {
            throw new ProjectError(`Library '${library}' does not exist in the registry`);
        }

        const pkg = await this.loadProjectPackageJson();
        const baseDeps = await this.resolveDependencies({ ...pkg.dependencies }, "registry");
        const versions = (await this.registry?.listVersions(library)) || [];
        for (const version of versions) {
            const resolvedDependencies = await this.addLibVersion(library, version, baseDeps);
            pkg.dependencies[library] = version;
            await this.saveProjectPackageJson(pkg);
            await this.installDependencies(resolvedDependencies);
            return pkg.dependencies;
        }
        throw new ProjectDependencyError(
            `Failed to add library '${library}' to project with any available version`
        );
    }

    async removeLibrary(libName: string): Promise<Dependencies> {
        if (!this.registry) {
            throw new ProjectError("Registry is not defined for the project");
        }
        this.out.write(`Removing library '${libName}' from project...\n`);
        const pkg = await this.loadProjectPackageJson();
        if (!(libName in pkg.dependencies)) {
            throw new ProjectError(
                `Library '${libName}' has not been found in project dependencies`
            );
        }
        delete pkg.dependencies[libName];
        await this.saveProjectPackageJson(pkg);

        const resolvedDeps = await this.resolveDependencies(pkg.dependencies, "local");
        await this.installDependencies(resolvedDeps);
        this.out.write(`Successfully removed library '${libName}' from project\n`);
        return pkg.dependencies;
    }

    private async resolveDependencies(
        dependencies: Dependencies,
        dataSourceType: DataSourceType = "registry"
    ): Promise<ResolvedDependencies> {
        if (!this.registry) {
            throw new ProjectError("Registry is not defined for the project");
        }
        const resolvedDeps = { ...dependencies };
        const processedLibraries = new Set<string>();
        const queue: Array<DependencyObject> = [];

        // start with direct dependencies
        for (const [libName, libVersion] of Object.entries(resolvedDeps)) {
            queue.push({ name: libName, version: libVersion });
        }

        // process BFS for dependencies
        while (queue.length > 0) {
            const dep = queue.shift()!;

            if (processedLibraries.has(dep.name)) {
                continue;
            }
            processedLibraries.add(dep.name);

            try {
                let packageJson: PackageJson | undefined;

                if (dataSourceType === "local") {
                    // use local package.json
                    const localPkgPath = path.join(
                        this.projectPath,
                        "node_modules",
                        dep.name,
                        "package.json"
                    );
                    if (this.fs.existsSync(localPkgPath)) {
                        packageJson = await loadPackageJson(this.fs, localPkgPath);
                    }
                } else {
                    // fetch from registry
                    packageJson = await this.registry?.getPackageJson(dep.name, dep.version);
                }

                if (!packageJson) {
                    if (dataSourceType === "local") {
                        this.err.write(
                            `Package '${dep.name}@${dep.version}' not found locally in node_modules. Skipping transitive deps.\n`
                        );
                        continue;
                    }
                    // TODO: fix it
                    throw new Error(`Package '${dep.name}@${dep.version}' not found in registry`);
                }

                for (const [libName, libVersion] of Object.entries(packageJson.dependencies)) {
                    if (libName in resolvedDeps) {
                        // check for version conflicts - only allow exact matches
                        if (resolvedDeps[libName] !== libVersion) {
                            throw new ProjectDependencyError(
                                `Version conflict for library '${libName}': requested '${libVersion}', already resolved '${resolvedDeps[libName]}'`,
                                libName,
                                libVersion,
                                resolvedDeps[libName]
                            );
                        }
                        continue;
                    }

                    // add new dependency and enqueue for processing
                    resolvedDeps[libName] = libVersion;
                    queue.push({ name: libName, version: libVersion });
                }
            } catch (error) {
                if (dataSourceType === "local") {
                    this.err.write(
                        `Warning: Could not resolve local dependencies for '${dep.name}@${dep.version}': ${error}\n`
                    );
                    continue;
                }
                this.err.write(
                    `Failed to resolve dependencies for '${dep.name}@${dep.version}': ${error}\n`
                );
                throw error;
            }
        }

        return resolvedDeps;
    }

    private async installDependencies(dependencies: Dependencies): Promise<void> {
        if (!this.registry) {
            throw new ProjectError("Registry is not defined for the project");
        }
        const nodeModulesPath = path.join(this.projectPath, "node_modules");
        if (this.fs.existsSync(nodeModulesPath)) {
            await this.fs.promises.rm(nodeModulesPath, { recursive: true, force: true });
        }

        // install all resolved dependencies
        for (const [libName, libVersion] of Object.entries(dependencies)) {
            try {
                this.out.write(` - Installing library '${libName}' version '${libVersion}'\n`);
                const packageData = await this.registry.getPackageTgz(libName, libVersion);
                const installPath = getPackagePath(this.projectPath, libName);
                await extractTgzPackage(packageData, this.fs, installPath);
            } catch (error) {
                this.err.write(`Failed to install library '${libName}@${libVersion}': ${error}\n`);
                throw error;
            }
        }
        this.out.write("All dependencies resolved and installed successfully.\n");
    }

    private async addLibVersion(
        library: string,
        version: string,
        testedDeps: Dependencies
    ): Promise<Dependencies> {
        const newDeps = { ...testedDeps, [library]: version };
        return await this.resolveDependencies(newDeps, "registry");
    }

    /**
     * Get JacLy block files and translations for all libraries
     * @param locale - The locale for translations (e.g., "en", "cs")
     * @returns JaclyData
     */
    async getJaclyData(locale: string): Promise<JaclyBlocksData> {
        const pkg = await this.loadProjectPackageJson();
        const resolvedDeps = await this.resolveDependencies(pkg.dependencies, "local");
        const jaclyData: JaclyBlocksData = { blockFiles: {}, translations: {} };

        for (const [libName] of Object.entries(resolvedDeps)) {
            const pkgPath = path.join(this.projectPath, "node_modules", libName, "package.json");
            if (!this.fs.existsSync(pkgPath)) {
                continue;
            }

            let libPkg;
            try {
                libPkg = await loadPackageJson(this.fs, pkgPath);
            } catch (e) {
                this.err.write(`Failed to load package.json for '${libName}': ${e}. Skipping.\n`);
                continue;
            }

            if (libPkg.jaculus && libPkg.jaculus.blocks) {
                const blocksDir = path.join(
                    this.projectPath,
                    "node_modules",
                    libName,
                    libPkg.jaculus.blocks
                );

                if (this.fs.existsSync(blocksDir)) {
                    const files = this.fs.readdirSync(blocksDir);
                    for (const file of files) {
                        const justFilename = path.basename(file);
                        if (!/^[a-zA-Z0-9_-]+\.jacly\.json$/.test(justFilename)) {
                            continue;
                        }
                        const fullPath = path.join(blocksDir, file);
                        try {
                            const fileContent = await this.fs.promises.readFile(fullPath, "utf-8");
                            jaclyData.blockFiles[fullPath] = JSON.parse(fileContent);
                        } catch (e) {
                            this.err.write(
                                `Failed to read/parse JacLy block file '${fullPath}': ${e}\n`
                            );
                            throw e;
                        }
                    }
                }

                const translationFile = path.join(blocksDir, "translations", `${locale}.lang.json`);
                if (this.fs.existsSync(translationFile)) {
                    try {
                        const fileContent = await this.fs.promises.readFile(
                            translationFile,
                            "utf-8"
                        );
                        const localeTranslations = JSON.parse(fileContent);
                        Object.assign(jaclyData.translations, localeTranslations);
                    } catch (e) {
                        this.err.write(
                            `Failed to read/parse JacLy translation file '${translationFile}': ${e}\n`
                        );
                        throw e;
                    }
                }
            }
        }
        return jaclyData;
    }

    async getFlashFiles(): Promise<Record<string, Uint8Array>> {
        const jaculusFiles: Record<string, Uint8Array> = {};

        const collectFlashFiles = async (dirPath: string, prefix: string = "") => {
            if (!this.fs.existsSync(dirPath)) return;
            await traverseDirectory(
                this.fs.promises,
                dirPath,
                async (filePath: string, content: Uint8Array) => {
                    const relativePath = path.relative(dirPath, filePath).replace(/\\/g, "/");
                    jaculusFiles[path.join(prefix, relativePath)] = content;
                },
                (filePath: string) =>
                    path.extname(filePath) === ".js" || path.basename(filePath) === "package.json"
            );
        };

        jaculusFiles["package.json"] = this.fs.readFileSync(
            path.join(this.projectPath, "package.json")
        );
        await collectFlashFiles(path.join(this.projectPath, "build"));
        await collectFlashFiles(path.join(this.projectPath, "node_modules"), "node_modules");
        return jaculusFiles;
    }
}
