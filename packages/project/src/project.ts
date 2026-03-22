import path from "path";
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
import { Logger, type ProjectBundle } from "@jaculus/common";

export type ResolvedDependencies = Dependencies;

export type { ProjectBundle };

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
        public logger: Logger
    ) {}

    async loadProjectPackageJson(): Promise<PackageJson> {
        return loadPackageJson(this.fs, path.join(this.projectPath, "package.json"));
    }

    async saveProjectPackageJson(pkg: PackageJson): Promise<void> {
        await savePackageJson(this.fs, path.join(this.projectPath, "package.json"), pkg);
    }

    async listDependencies(
        includeTransitive: boolean = false,
        registry?: Registry
    ): Promise<Dependencies | ResolvedDependencies> {
        const pkg = await this.loadProjectPackageJson();
        if (!includeTransitive) {
            return pkg.dependencies;
        }
        if (!registry) {
            throw new ProjectError("Registry instance is required for resolving dependencies");
        }
        return await this.resolveDependencies(pkg.dependencies, registry);
    }

    async install(registry: Registry): Promise<Dependencies> {
        this.logger.info("Resolving project dependencies...");
        const pkg = await this.loadProjectPackageJson();
        const resolvedDeps = await this.resolveDependencies(pkg.dependencies, registry);
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

        this.logger.info(`Adding library '${library}@${version}' to project.`);
        const pkg = await this.loadProjectPackageJson();
        const resolvedDependencies = await this.addLibVersion(
            registry,
            library,
            version,
            pkg.dependencies
        );
        pkg.dependencies[library] = version;
        await this.saveProjectPackageJson(pkg);
        await this.installDependencies(registry, resolvedDependencies);
        return pkg.dependencies;
    }

    async addLibrary(registry: Registry, library: string): Promise<Dependencies> {
        this.logger.info(`Adding library '${library}' to project.`);
        if (!(await registry.exists(library))) {
            throw new ProjectError(`Library '${library}' does not exist in the registry`);
        }

        const pkg = await this.loadProjectPackageJson();
        const baseDeps = await this.resolveDependencies({ ...pkg.dependencies }, registry);
        const versions = (await registry.listVersions(library)) || [];
        for (const version of versions) {
            const resolvedDependencies = await this.addLibVersion(
                registry,
                library,
                version,
                baseDeps
            );
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
        this.logger.info(`Removing library '${libName}' from project...`);
        const pkg = await this.loadProjectPackageJson();
        if (!(libName in pkg.dependencies)) {
            throw new ProjectError(
                `Library '${libName}' has not been found in project dependencies`
            );
        }
        delete pkg.dependencies[libName];
        await this.saveProjectPackageJson(pkg);

        const resolvedDeps = await this.resolveDependencies(pkg.dependencies, registry);
        await this.installDependencies(registry, resolvedDeps);
        this.logger.info(`Successfully removed library '${libName}' from project`);
        return pkg.dependencies;
    }

    private async resolveDependencies(
        dependencies: Dependencies,
        registry: Registry
    ): Promise<ResolvedDependencies> {
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
                const packageJson = await registry.getPackageJson(dep.name, dep.version);
                if (!packageJson) {
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
                this.logger.error(
                    `Failed to resolve dependencies for '${dep.name}@${dep.version}': ${error}`
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
                this.logger.verbose(` - Installing library '${libName}' version '${libVersion}'`);
                const packageData = await registry.getPackageTgz(libName, libVersion);
                const installPath = getPackagePath(this.projectPath, libName);
                await extractTgzPackage(packageData, this.fs, installPath);
            } catch (error) {
                this.logger.error(`Failed to install library '${libName}@${libVersion}': ${error}`);
                throw error;
            }
        }
        this.logger.info("All dependencies resolved and installed successfully.");
    }

    private async addLibVersion(
        registry: Registry,
        library: string,
        version: string,
        testedDeps: Dependencies
    ): Promise<Dependencies> {
        const newDeps = { ...testedDeps, [library]: version };
        return await this.resolveDependencies(newDeps, registry);
    }

    /**
     * Discover all package directories in node_modules, including scoped packages.
     * @returns Array of absolute paths to package directories
     */
    private discoverPackagesInNodeModules(): string[] {
        const nodeModulesPath = path.join(this.projectPath, "node_modules");
        if (!this.fs.existsSync(nodeModulesPath)) {
            return [];
        }

        const packageDirs: string[] = [];
        const entries = this.fs.readdirSync(nodeModulesPath);

        for (const entry of entries) {
            if (entry.startsWith(".")) continue;
            const entryPath = path.join(nodeModulesPath, entry);
            if (!this.fs.statSync(entryPath).isDirectory()) continue;

            if (entry.startsWith("@")) {
                // Scoped package scope dir — list sub-packages
                const scopedEntries = this.fs.readdirSync(entryPath);
                for (const scopedEntry of scopedEntries) {
                    const scopedPath = path.join(entryPath, scopedEntry);
                    if (this.fs.statSync(scopedPath).isDirectory()) {
                        packageDirs.push(scopedPath);
                    }
                }
            } else {
                packageDirs.push(entryPath);
            }
        }

        return packageDirs;
    }

    private async loadJaclyBlockFiles(blocksDir: string): Promise<JaclyBlocksFiles> {
        const blockFiles: JaclyBlocksFiles = {};
        if (!this.fs.existsSync(blocksDir)) {
            return blockFiles;
        }

        const files = this.fs.readdirSync(blocksDir);
        for (const file of files) {
            const justFilename = path.basename(file);
            if (!/^[a-zA-Z0-9_-]+\.jacly\.json$/.test(justFilename)) {
                continue;
            }
            const fullPath = path.join(blocksDir, file);
            try {
                const fileContent = await this.fs.promises.readFile(fullPath, "utf-8");
                blockFiles[fullPath] = JSON.parse(fileContent);
            } catch (e) {
                this.logger.error(`Failed to read/parse JacLy block file '${fullPath}': ${e}`);
                throw e;
            }
        }

        return blockFiles;
    }

    private async loadJaclyTranslations(
        blocksDir: string,
        locale: string
    ): Promise<JaclyBlocksTranslations> {
        const translationFile = path.join(blocksDir, "translations", `${locale}.lang.json`);
        if (!this.fs.existsSync(translationFile)) {
            return {};
        }

        try {
            const fileContent = await this.fs.promises.readFile(translationFile, "utf-8");
            return JSON.parse(fileContent);
        } catch (e) {
            this.logger.error(
                `Failed to read/parse JacLy translation file '${translationFile}': ${e}`
            );
            throw e;
        }
    }

    /**
     * Get JacLy block files and translations for all installed packages.
     * Scans node_modules directly instead of resolving dependencies.
     * @param locale - The locale for translations (e.g., "en", "cs")
     * @returns JaclyData
     */
    async getJaclyData(locale: string): Promise<JaclyBlocksData> {
        const jaclyData: JaclyBlocksData = { blockFiles: {}, translations: {} };
        const packageDirs = this.discoverPackagesInNodeModules();

        for (const pkgDir of packageDirs) {
            const pkgJsonPath = path.join(pkgDir, "package.json");
            if (!this.fs.existsSync(pkgJsonPath)) {
                continue;
            }

            let libPkg;
            try {
                libPkg = await loadPackageJson(this.fs, pkgJsonPath);
            } catch (e) {
                this.logger.warn(`Failed to load package.json for '${pkgDir}': ${e}. Skipping.`);
                continue;
            }

            if (libPkg.jaculus && libPkg.jaculus.blocks) {
                const blocksDir = path.join(pkgDir, libPkg.jaculus.blocks);

                const blockFiles = await this.loadJaclyBlockFiles(blocksDir);
                Object.assign(jaclyData.blockFiles, blockFiles);

                const translations = await this.loadJaclyTranslations(blocksDir, locale);
                Object.assign(jaclyData.translations, translations);
            }
        }

        return jaclyData;
    }

    async getFlashFiles(): Promise<ProjectBundle> {
        const files: Record<string, Uint8Array> = {};
        const dirs = new Set<string>();

        const collectFlashFiles = async (dirPath: string, prefix: string = "") => {
            if (!this.fs.existsSync(dirPath)) return;
            await traverseDirectory(
                this.fs.promises,
                dirPath,
                async (filePath: string, content: Uint8Array) => {
                    const relativePath = path.relative(dirPath, filePath).replace(/\\/g, "/");
                    const relPath = path.join(prefix, relativePath);
                    files[relPath] = content;
                    // Collect all parent dirs in parent-first order
                    const segments = relPath.split("/");
                    for (let i = 1; i < segments.length; i++) {
                        dirs.add(segments.slice(0, i).join("/"));
                    }
                },
                (filePath: string) =>
                    path.extname(filePath) === ".js" || path.basename(filePath) === "package.json"
            );
        };

        files["package.json"] = this.fs.readFileSync(path.join(this.projectPath, "package.json"));
        await collectFlashFiles(path.join(this.projectPath, "build"));
        await collectFlashFiles(path.join(this.projectPath, "node_modules"), "node_modules");
        return { dirs, files };
    }
}
