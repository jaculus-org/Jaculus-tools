import path from "path";
import fs from "fs";
import { tmpdir } from "os";
import * as chai from "chai";
import { Archive } from "@obsidize/tar-browserify";
import pako from "pako";
import type { Logger } from "../../packages/common/dist/logger.js";
import { JaculusRequestError, RequestFunction } from "../../packages/common/dist/request.js";
import { Project } from "../../packages/project/src/project.js";
import { PackageJson, loadPackageJson } from "../../packages/project/src/package.js";
import { Registry } from "../../packages/project/src/registry.js";

export const expect = chai.expect;
export const registryBasePath = "file://data/test-registry/";
export { fs, path, fs as mockFs };
export type LogLevel = keyof Logger;

export async function createTarGzPackage(sourceDir: string, outFile: string): Promise<void> {
    const archive = new Archive();

    // recursively add files from sourceDir with "package/" prefix
    function addFilesToArchive(dir: string, baseDir: string = dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);
            const tarPath = path.join("package", relativePath);

            if (entry.isDirectory()) {
                archive.addDirectory(tarPath);
                addFilesToArchive(fullPath, baseDir);
            } else if (entry.isFile()) {
                const content = fs.readFileSync(fullPath);
                archive.addBinaryFile(tarPath, content);
            }
        }
    }

    addFilesToArchive(sourceDir);

    const tarData = archive.toUint8Array();
    const gzData = pako.gzip(tarData);
    fs.writeFileSync(outFile, gzData);
}

export async function generateTestRegistryPackages(registryBasePath: string): Promise<void> {
    const baseDir = registryBasePath.replace(/^file:\/\//, "");
    const testDataPath = path.resolve(
        path.dirname(import.meta.url.replace("file://", "")),
        baseDir
    );
    const libraries = JSON.parse(fs.readFileSync(path.join(testDataPath, "list.json"), "utf-8"));

    for (const lib of libraries) {
        const libPath = path.join(testDataPath, lib.id);
        const versionsFile = path.join(libPath, "versions.json");

        if (fs.existsSync(versionsFile)) {
            const versions = JSON.parse(fs.readFileSync(versionsFile, "utf-8"));

            for (const ver of versions) {
                const versionPath = path.join(libPath, ver.version);
                const packagePath = path.join(versionPath, "package");
                const tarGzPath = path.join(versionPath, "package.tar.gz");

                if (fs.existsSync(packagePath)) {
                    await createTarGzPackage(packagePath, tarGzPath);
                }
            }
        }
    }
}

export class MockLogger implements Logger {
    private entries: Array<{ level: LogLevel; message: string }> = [];

    private normalize(message?: string): string | null {
        if (message === undefined) {
            return null;
        }
        return message.endsWith("\n") ? message : `${message}\n`;
    }

    private record(level: LogLevel, message?: string) {
        const normalized = this.normalize(message);
        if (normalized === null) {
            return;
        }
        this.entries.push({ level, message: normalized });
    }

    error = (message?: string) => this.record("error", message);
    warn = (message?: string) => this.record("warn", message);
    info = (message?: string) => this.record("info", message);
    verbose = (message?: string) => this.record("verbose", message);
    debug = (message?: string) => this.record("debug", message);
    silly = (message?: string) => this.record("silly", message);

    output(levels?: LogLevel | LogLevel[]): string {
        if (!levels) {
            return this.entries.map((entry) => entry.message).join("");
        }
        const levelSet = new Set(Array.isArray(levels) ? levels : [levels]);
        return this.entries
            .filter((entry) => levelSet.has(entry.level))
            .map((entry) => entry.message)
            .join("");
    }

    clear(levels?: LogLevel | LogLevel[]) {
        if (!levels) {
            this.entries = [];
            return;
        }
        const levelSet = new Set(Array.isArray(levels) ? levels : [levels]);
        this.entries = this.entries.filter((entry) => !levelSet.has(entry.level));
    }
}

export function createMockLogger(): MockLogger {
    return new MockLogger();
}

export const createGetRequest = (): RequestFunction => async (baseUri, libFile) => {
    expect(baseUri).to.match(/^(file:\/\/|http:\/\/)/);
    if (libFile === "") {
        return new Uint8Array();
    }

    const baseDir = baseUri.replace(/^file:\/\//, "");
    const filePath = path.resolve(
        path.dirname(import.meta.url.replace("file://", "")),
        baseDir,
        libFile
    );
    try {
        return new Uint8Array(fs.readFileSync(filePath));
    } catch (error) {
        throw new JaculusRequestError(`Failed to read ${filePath}: ${(error as Error).message}`);
    }
};

export const createFailingGetRequest = (): RequestFunction => async (baseUri, libFile) => {
    throw new JaculusRequestError(`Simulated network error for ${baseUri}/${libFile}`);
};

export function createPackageJson(
    projectPath: string,
    dependencies: Record<string, string> = {},
    registry: string[] = [registryBasePath],
    additionalFields: Partial<PackageJson> = {}
): void {
    const packageData: PackageJson = {
        name: "test-project",
        version: "0.0.1",
        dependencies,
        registry,
        ...additionalFields,
    };

    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(path.join(projectPath, "package.json"), JSON.stringify(packageData, null, 2));
}

export async function createMockProject(
    projectPath: string,
    logger: Logger = createMockLogger()
): Promise<Project> {
    return new Project(fs, projectPath, logger);
}

export async function createMockRegistry(
    projectPath: string,
    getRequest: RequestFunction,
    logger: Logger = createMockLogger()
): Promise<Registry> {
    const pkg = await loadPackageJson(fs, path.join(projectPath, "package.json"));
    return new Registry(pkg.registry, getRequest, logger);
}

export function createTestDir(prefix: string = "jaculus-test-"): string {
    return fs.mkdtempSync(path.join(tmpdir(), prefix));
}

export function cleanupTestDir(tempDir: string): void {
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

export function createProjectStructure(
    tempDir: string,
    projectName: string,
    packageData?: Partial<PackageJson>
): string {
    const projectPath = path.join(tempDir, projectName);

    if (packageData) {
        createPackageJson(
            projectPath,
            packageData.dependencies || {},
            packageData.registry || [registryBasePath],
            packageData
        );
    } else {
        fs.mkdirSync(projectPath, { recursive: true });
    }

    return projectPath;
}

export function setupTest(prefix?: string): {
    tempDir: string;
    logger: MockLogger;
    getRequest: RequestFunction;
    cleanup: () => void;
} {
    const tempDir = createTestDir(prefix);
    const logger = createMockLogger();
    const getRequest = createGetRequest();

    const cleanup = () => cleanupTestDir(tempDir);

    return { tempDir, logger, getRequest, cleanup };
}

export function readPackageJson(projectPath: string): PackageJson {
    const packagePath = path.join(projectPath, "package.json");
    return JSON.parse(fs.readFileSync(packagePath, "utf-8"));
}

export function expectPackageJson(
    projectPath: string,
    expectations: {
        hasDependency?: [string, string?];
        noDependency?: string;
        dependencyCount?: number;
    }
): void {
    const pkg = readPackageJson(projectPath);

    if (expectations.hasDependency) {
        const [name, version] = expectations.hasDependency;
        if (version) {
            expect(pkg.dependencies).to.have.property(name, version);
        } else {
            expect(pkg.dependencies).to.have.property(name);
        }
    }

    if (expectations.noDependency) {
        expect(pkg.dependencies).to.not.have.property(expectations.noDependency);
    }

    if (expectations.dependencyCount !== undefined) {
        expect(Object.keys(pkg.dependencies)).to.have.length(expectations.dependencyCount);
    }
}

export function expectLoggerMessage(
    logger: MockLogger,
    includes: string[],
    excludes: string[] = [],
    levels: LogLevel[] = ["info", "verbose", "debug", "silly"]
): void {
    const output = logger.output(levels);
    for (const message of includes) {
        expect(output).to.include(message);
    }

    for (const message of excludes) {
        expect(output).to.not.include(message);
    }
}

export async function expectAsyncError(
    action: () => Promise<unknown>,
    messageIncludes?: string,
    failureMessage: string = "Expected operation to throw an error"
): Promise<Error> {
    try {
        await action();
        expect.fail(failureMessage);
        throw new Error(failureMessage);
    } catch (error) {
        const normalizedError =
            error instanceof Error
                ? error
                : new Error(typeof error === "string" ? error : String(error));
        if (messageIncludes) {
            expect(normalizedError.message).to.include(messageIncludes);
        }
        return normalizedError;
    }
}
