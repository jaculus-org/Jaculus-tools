import path from "path";
import fs from "fs";
import { tmpdir } from "os";
import { Writable } from "stream";
import * as chai from "chai";
import { Archive } from "@obsidize/tar-browserify";
import pako from "pako";
import { JaculusRequestError, RequestFunction } from "@jaculus/project/fs";
import { Project } from "@jaculus/project";
import { PackageJson, loadPackageJson } from "@jaculus/project/package";
import { Registry } from "@jaculus/project/registry";

export const expect = chai.expect;
export const registryBasePath = "file://data/test-registry/";
export { fs, path, fs as mockFs };

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

// helper class to capture output
export class MockWritable extends Writable {
    public output: string = "";

    _write(chunk: any, _encoding: string, callback: (error?: Error | null) => void) {
        this.output += chunk.toString();
        callback();
    }

    clear() {
        this.output = "";
    }
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
    mockOut: MockWritable,
    mockErr: MockWritable,
    getRequest?: RequestFunction
): Promise<Project> {
    const pkg = await loadPackageJson(fs, path.join(projectPath, "package.json"));
    let registry: Registry | undefined = undefined;
    if (getRequest) {
        registry = Registry.createWithoutValidation(pkg.registry, getRequest);
    }
    return new Project(fs, projectPath, mockOut, mockErr, registry);
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
    mockOut: MockWritable;
    mockErr: MockWritable;
    getRequest: RequestFunction;
    cleanup: () => void;
} {
    const tempDir = createTestDir(prefix);
    const mockOut = new MockWritable();
    const mockErr = new MockWritable();
    const getRequest = createGetRequest();

    const cleanup = () => cleanupTestDir(tempDir);

    return { tempDir, mockOut, mockErr, getRequest, cleanup };
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

export function expectOutputMessage(
    mockOut: MockWritable,
    includes: string[],
    excludes: string[] = []
): void {
    for (const message of includes) {
        expect(mockOut.output).to.include(message);
    }

    for (const message of excludes) {
        expect(mockOut.output).to.not.include(message);
    }
}
