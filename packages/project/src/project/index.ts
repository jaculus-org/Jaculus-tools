import path from "path";
import { Writable } from "stream";
import { extractTgz, FSInterface, traverseDirectory } from "../fs/index.js";
import { Registry } from "./registry.js";
import {
    parsePackageJson,
    loadPackageJson,
    loadPackageJsonSync,
    savePackageJson,
    RegistryUris,
    Dependencies,
    Dependency,
    PackageJson,
    splitLibraryNameVersion,
    getPackagePath,
    projectJsonSchema,
    JaculusProjectType,
    JaculusConfig,
} from "./package.js";

export type ResolvedDependencies = Dependencies;

export interface ProjectPackage {
    dirs: string[];
    files: Record<string, Uint8Array>;
}

export interface JaclyBlocksFiles {
    [filePath: string]: object;
}

export interface JaclyData {
    blockFiles: JaclyBlocksFiles;
    translations: Record<string, string>;
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

    async installedLibraries(returnResolved: boolean = false): Promise<Dependencies> {
        const pkg = await loadPackageJson(this.fs, path.join(this.projectPath, "package.json"));
        if (returnResolved) {
            const resolvedDeps = await this.resolveDependencies(pkg.dependencies);
            return resolvedDeps;
        }
        return pkg.dependencies;
    }

    async install(): Promise<Dependencies> {
        this.out.write("Resolving project dependencies...\n");
        const pkg = await loadPackageJson(this.fs, path.join(this.projectPath, "package.json"));
        const resolvedDeps = await this.resolveDependencies(pkg.dependencies);
        await this.installDependencies(resolvedDeps);
        return pkg.dependencies;
    }

    public async addLibraryVersion(library: string, version: string): Promise<Dependencies> {
        this.out.write(`Adding library '${library}@${version}' to project.\n`);
        if (!(await this.registry?.exists(library))) {
            throw new Error(`Library '${library}' does not exist in the registry`);
        }

        const pkg = await loadPackageJson(this.fs, path.join(this.projectPath, "package.json"));
        const resolvedDeps = await this.addLibVersion(library, version, pkg.dependencies);
        if (resolvedDeps) {
            pkg.dependencies[library] = version;
            await savePackageJson(this.fs, path.join(this.projectPath, "package.json"), pkg);
            await this.installDependencies(resolvedDeps);
            return pkg.dependencies;
        } else {
            throw new Error(`Failed to add library '${library}@${version}' to project`);
        }
    }

    async addLibrary(library: string): Promise<Dependencies> {
        this.out.write(`Adding library '${library}' to project.\n`);
        if (!(await this.registry?.exists(library))) {
            throw new Error(`Library '${library}' does not exist in the registry`);
        }

        const pkg = await loadPackageJson(this.fs, path.join(this.projectPath, "package.json"));
        const baseDeps = await this.resolveDependencies({ ...pkg.dependencies });
        const versions = (await this.registry?.listVersions(library)) || [];
        for (const version of versions) {
            const resolvedDeps = await this.addLibVersion(library, version, baseDeps);
            if (resolvedDeps) {
                pkg.dependencies[library] = version;
                await savePackageJson(this.fs, path.join(this.projectPath, "package.json"), pkg);
                await this.installDependencies(resolvedDeps);
                return pkg.dependencies;
            }
        }
        throw new Error(`Failed to add library '${library}' to project with any available version`);
    }

    async removeLibrary(libName: string): Promise<Dependencies> {
        this.out.write(`Removing library '${libName}' from project...\n`);
        const pkg = await loadPackageJson(this.fs, path.join(this.projectPath, "package.json"));
        delete pkg.dependencies[libName];
        await savePackageJson(this.fs, path.join(this.projectPath, "package.json"), pkg);
        const resolvedDeps = await this.resolveDependencies(pkg.dependencies);
        await this.installDependencies(resolvedDeps);
        this.out.write(`Successfully removed library '${libName}' from project\n`);
        console.log(`Project ${pkg.dependencies} resolved dependencies:`, resolvedDeps);
        return pkg.dependencies;
    }

    private async resolveDependencies(dependencies: Dependencies): Promise<ResolvedDependencies> {
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

            try {
                const packageJson = await this.registry?.getPackageJson(dep.name, dep.version);
                if (!packageJson) {
                    throw new Error(`Registry is not defined or returned no package.json`);
                }

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

        return resolvedDeps;
    }

    private async installDependencies(dependencies: Dependencies): Promise<void> {
        // remove all existing installed libraries
        const projectPackages = getPackagePath(this.projectPath, "");
        if (this.fs.existsSync(projectPackages)) {
            await this.fs.promises.rm(projectPackages, { recursive: true, force: true });
        }

        // install all resolved dependencies
        for (const [libName, libVersion] of Object.entries(dependencies)) {
            try {
                this.out.write(` - Installing library '${libName}' version '${libVersion}'\n`);
                const packageData = await this.registry?.getPackageTgz(libName, libVersion);
                if (!packageData) {
                    throw new Error(`Registry is not defined or returned no package data`);
                }
                const installPath = getPackagePath(this.projectPath, libName);
                await extractTgz(packageData, this.fs, installPath);
            } catch (error) {
                const errorMsg = `Failed to install library '${libName}@${libVersion}': ${error}`;
                this.err.write(`${errorMsg}\n`);
                throw new Error(errorMsg);
            }
        }
        this.out.write("All dependencies resolved and installed successfully.\n");
    }

    private async addLibVersion(
        library: string,
        version: string,
        testedDeps: Dependencies
    ): Promise<Dependencies | null> {
        const newDeps = { ...testedDeps, [library]: version };
        try {
            return this.resolveDependencies(newDeps);
        } catch (error) {
            this.err.write(`Error adding library '${library}@${version}': ${error}\n`);
        }
        return null;
    }

    async getJacLyFolder(): Promise<string | undefined> {
        const pkg = await loadPackageJson(this.fs, path.join(this.projectPath, "package.json"));
        return pkg.jaculus?.blocks;
    }

    /**
     * Get all JacLy block files from installed libraries
     * @param dependencies
     * @returns JaclyBlocksFiles - key is file path, value is parsed JSON content
     */
    async getJaclyBlockFiles(): Promise<JaclyBlocksFiles> {
        const pkg = await loadPackageJson(this.fs, path.join(this.projectPath, "package.json"));
        const resolvedDeps = await this.resolveDependencies(pkg.dependencies);
        const jaclyBlockFiles: JaclyBlocksFiles = {};
        for (const [libName] of Object.entries(resolvedDeps)) {
            const pkg = await loadPackageJson(
                this.fs,
                path.join(this.projectPath, "node_modules", libName, "package.json")
            );
            if (!pkg) {
                this.err.write(
                    `Failed to load package.json for '${libName}'. Install dependencies before fetching JacLy files.\n`
                );
                continue;
            }
            if (pkg.jaculus && pkg.jaculus.blocks) {
                const blockFilePath = path.join(
                    this.projectPath,
                    "node_modules",
                    libName,
                    pkg.jaculus.blocks
                );
                // read folder and add all .jacly.json file
                if (this.fs.existsSync(blockFilePath)) {
                    const files = this.fs.readdirSync(blockFilePath);
                    for (const file of files) {
                        const justFilename = path.basename(file);
                        if (file.endsWith(".jacly.json") && !justFilename.startsWith(".")) {
                            const fullPath = path.join(blockFilePath, file);
                            try {
                                const fileContent = this.fs.readFileSync(fullPath, "utf-8");
                                jaclyBlockFiles[fullPath] = JSON.parse(fileContent);
                            } catch (e) {
                                this.err.write(
                                    `Failed to read/parse JacLy block file '${fullPath}': ${e}\n`
                                );
                                throw e;
                            }
                        }
                    }
                } else {
                    this.err.write(
                        `JacLy blocks folder '${blockFilePath}' does not exist for library '${libName}'.\n`
                    );
                }
            }
        }
        return jaclyBlockFiles;
    }

    /**
     * Get all JacLy block files and translations from installed libraries in one pass.
     * @param locale - The locale for translations (e.g., "en", "cs")
     * @returns JaclyData
     */
    async getJaclyData(locale: string): Promise<JaclyData> {
        const pkg = await loadPackageJson(this.fs, path.join(this.projectPath, "package.json"));
        const resolvedDeps = await this.resolveDependencies(pkg.dependencies);
        const blockFiles: JaclyBlocksFiles = {};
        const translations: Record<string, string> = {};

        for (const [libName] of Object.entries(resolvedDeps)) {
            const pkgPath = path.join(this.projectPath, "node_modules", libName, "package.json");

            // Skip packages that don't have a package.json (e.g., @types packages that are part of the project structure)
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
            if (!libPkg) {
                this.err.write(
                    `Failed to load package.json for '${libName}'. Install dependencies before fetching JacLy files.\n`
                );
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
                        if (file.endsWith(".jacly.json") && !justFilename.startsWith(".")) {
                            const fullPath = path.join(blocksDir, file);
                            try {
                                const fileContent = this.fs.readFileSync(fullPath, "utf-8");
                                blockFiles[fullPath] = JSON.parse(fileContent);
                            } catch (e) {
                                this.err.write(
                                    `Failed to read/parse JacLy block file '${fullPath}': ${e}\n`
                                );
                                throw e;
                            }
                        }
                    }
                }

                const translationFile = path.join(blocksDir, "translations", `${locale}.lang.json`);
                if (this.fs.existsSync(translationFile)) {
                    try {
                        const fileContent = this.fs.readFileSync(translationFile, "utf-8");
                        const localeTranslations = JSON.parse(fileContent);
                        Object.assign(translations, localeTranslations);
                    } catch (e) {
                        this.err.write(
                            `Failed to read/parse JacLy translation file '${translationFile}': ${e}\n`
                        );
                        throw e;
                    }
                }
            }
        }

        return { blockFiles, translations };
    }

    async getFlashFiles(): Promise<Record<string, Uint8Array>> {
        const jaculusFiles: Record<string, Uint8Array> = {};

        const collectJavaScriptFiles = async (dirPath: string, prefix: string = "") => {
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
        await collectJavaScriptFiles(path.join(this.projectPath, "build"));
        await collectJavaScriptFiles(path.join(this.projectPath, "node_modules"), "node_modules");
        return jaculusFiles;
    }
}

export {
    Registry,
    Dependency,
    Dependencies,
    RegistryUris,
    PackageJson,
    parsePackageJson,
    loadPackageJson,
    loadPackageJsonSync,
    savePackageJson,
    splitLibraryNameVersion,
    projectJsonSchema,
    JaculusProjectType,
    JaculusConfig,
};
