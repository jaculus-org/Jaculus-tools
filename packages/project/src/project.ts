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
import { Logger } from "@jaculus/common";

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
        public logger: Logger
    ) {}

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

    async install(registry: Registry): Promise<Dependencies> {
        this.out.write("Resolving project dependencies...\n");
        const pkg = await this.loadProjectPackageJson();
        const resolvedDeps = await this.resolveDependencies(pkg.dependencies, "registry");
        await this.installDependencies(registry, resolvedDeps);
        return pkg.dependencies;
    }

    async addLibraryVersion(
        registry: Registry,
        library: string,
        version: string
    ): Promise<Dependencies> {
        if (!(await registry.exists(library))) {
            throw new ProjectError(`Library '${library}' does not exist in the registry`);
        }

        this.out.write(`Adding library '${library}@${version}' to project.\n`);
        const pkg = await this.loadProjectPackageJson();
        const resolvedDependencies = await this.addLibVersion(library, version, pkg.dependencies);
        pkg.dependencies[library] = version;
        await this.saveProjectPackageJson(pkg);
        await this.installDependencies(registry, resolvedDependencies);
        return pkg.dependencies;
    }

    async addLibrary(registry: Registry, library: string): Promise<Dependencies> {
        this.out.write(`Adding library '${library}' to project.\n`);
        if (!(await registry.exists(library))) {
            throw new ProjectError(`Library '${library}' does not exist in the registry`);
        }

        const pkg = await this.loadProjectPackageJson();
        const baseDeps = await this.resolveDependencies({ ...pkg.dependencies }, "registry");
        const versions = (await registry.listVersions(library)) || [];
        for (const version of versions) {
            const resolvedDependencies = await this.addLibVersion(library, version, baseDeps);
            pkg.dependencies[library] = version;
            await this.saveProjectPackageJson(pkg);
            await this.installDependencies(registry, resolvedDependencies);
            return pkg.dependencies;
        }
        throw new ProjectDependencyError(
            `Failed to add library '${library}' to project with any available version`
        );
    }

    async removeLibrary(registry: Registry, libName: string): Promise<Dependencies> {
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
        await this.installDependencies(registry, resolvedDeps);
        this.out.write(`Successfully removed library '${libName}' from project\n`);
        return pkg.dependencies;
    }

    private async resolveDependencies(
        dependencies: Dependencies,
        dataSourceType: DataSourceType = "registry",
        registry?: Registry
    ): Promise<ResolvedDependencies> {
        if (dataSourceType === "registry" && !registry) {
            throw new ProjectError(
                "Registry instance is required for resolving dependencies from registry"
            );
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
                    packageJson = await registry!.getPackageJson(dep.name, dep.version);
                }

                if (!packageJson) {
                    if (dataSourceType === "local") {
                        this.logger.warn(
                            `Package '${dep.name}@${dep.version}' not found locally in node_modules. Skipping transitive deps.\n`
                        );
                        continue;
                    }

                    throw new ProjectDependencyError(
                        `Package '${dep.name}@${dep.version}' not found in registry`,
                        dep.name,
                        dep.version
                    );
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
                    this.logger.warn(
                        `Warning: Could not resolve local dependencies for '${dep.name}@${dep.version}': ${error}\n`
                    );
                    continue;
                }
                this.logger.error(
                    `Failed to resolve dependencies for '${dep.name}@${dep.version}': ${error}\n`
                );
                throw error;
            }
        }

        return resolvedDeps;
    }

    private async installDependencies(
        registry: Registry,
        dependencies: Dependencies
    ): Promise<void> {
        const nodeModulesPath = path.join(this.projectPath, "node_modules");
        if (this.fs.existsSync(nodeModulesPath)) {
            await this.fs.promises.rm(nodeModulesPath, { recursive: true, force: true });
        }

        // install all resolved dependencies
        for (const [libName, libVersion] of Object.entries(dependencies)) {
            try {
                this.out.write(` - Installing library '${libName}' version '${libVersion}'\n`);
                const packageData = await registry.getPackageTgz(libName, libVersion);
                const installPath = getPackagePath(this.projectPath, libName);
                await extractTgzPackage(packageData, this.fs, installPath);
            } catch (error) {
                this.logger.error(
                    `Failed to install library '${libName}@${libVersion}': ${error}\n`
                );
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
                this.logger.warn(`Failed to load package.json for '${libName}': ${e}. Skipping.\n`);
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
                            this.logger.error(
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
                        this.logger.error(
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
