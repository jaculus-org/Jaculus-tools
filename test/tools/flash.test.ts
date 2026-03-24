import { ProjectBundle } from "@jaculus/project";
import { createMockProject } from "../project/testHelpers.js";
import flash from "../../packages/tools/src/commands/flash.js";
import { cleanupTestDir, createTestDir, expect, fs, path } from "../project/testHelpers.js";

describe("Flash command", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTestDir("jaculus-flash-test-");
    });

    afterEach(() => {
        cleanupTestDir(tempDir);
    });

    it("should create parent directories recursively in the fallback upload path", async () => {
        const projectPath = path.join(tempDir, "project");
        fs.mkdirSync(path.join(projectPath, "node_modules", "core"), { recursive: true });
        fs.writeFileSync(
            path.join(projectPath, "package.json"),
            JSON.stringify(
                {
                    name: "test-project",
                    version: "0.0.1",
                    dependencies: {},
                    files: ["node_modules"],
                },
                null,
                2
            )
        );
        fs.writeFileSync(path.join(projectPath, "node_modules", "core", "index.js"), "42;\n");

        const createdDirs = new Set<string>();
        const createCalls: string[] = [];
        const writeCalls: string[] = [];

        const device = {
            controller: {
                lock: async () => {},
                stop: async () => {},
                start: async () => {},
                unlock: async () => {},
            },
            uploader: {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                getDirHashes: async (_path?: string) => {
                    throw new Error("unsupported");
                },
                uploadIfDifferent: async () => {
                    throw new Error("uploadIfDifferent should not be called in fallback mode");
                },
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                deleteDirectory: async (_path?: string) => {},
                createDirectory: async (dirPath: string) => {
                    const parentPath = path.dirname(dirPath);
                    if (dirPath !== "code" && !createdDirs.has(parentPath)) {
                        throw new Error(`Missing parent directory: ${parentPath}`);
                    }
                    createdDirs.add(dirPath);
                    createCalls.push(dirPath);
                },
                writeFile: async (filePath: string) => {
                    const parentPath = path.dirname(filePath);
                    if (!createdDirs.has(parentPath)) {
                        throw new Error(`Missing directory for file write: ${parentPath}`);
                    }
                    writeCalls.push(filePath);
                },
                uploadFiles: async (bundle: ProjectBundle, to: string) => {
                    // Simulate the fallback path of uploadFiles
                    await device.uploader.getDirHashes(to).catch(() => {});
                    await device.uploader.deleteDirectory(to);
                    await device.uploader.createDirectory(to);
                    for (const dir of bundle.dirs) {
                        await device.uploader.createDirectory(`${to}/${dir}`);
                    }
                    for (const filePath of Object.keys(bundle.files)) {
                        await device.uploader.writeFile(`${to}/${filePath}`);
                    }
                },
            },
        };

        await flash.run(
            ["--path", projectPath],
            {},
            { device: { value: device, onEnd: () => {} } }
        );

        expect(createCalls).to.deep.equal(["code", "code/node_modules", "code/node_modules/core"]);
        expect(writeCalls).to.include("code/package.json");
        expect(writeCalls).to.include("code/node_modules/core/index.js");
    });

    it("should include package-style files plus filtered node_modules when flashing", async () => {
        const projectPath = path.join(tempDir, "project");
        fs.mkdirSync(path.join(projectPath, "build", "examples"), { recursive: true });
        fs.mkdirSync(path.join(projectPath, "src"), { recursive: true });
        fs.mkdirSync(path.join(projectPath, "node_modules", "core", "dist"), { recursive: true });

        fs.writeFileSync(
            path.join(projectPath, "package.json"),
            JSON.stringify(
                {
                    name: "test-project",
                    version: "0.0.1",
                    dependencies: {},
                    files: ["build/*"],
                },
                null,
                2
            )
        );
        fs.writeFileSync(path.join(projectPath, "build", "index.js"), "export const a = 1;\n");
        fs.writeFileSync(
            path.join(projectPath, "build", "examples", "nested.js"),
            "export const b = 2;\n"
        );
        fs.writeFileSync(path.join(projectPath, "src", "ignored.ts"), "export {};\n");
        fs.writeFileSync(
            path.join(projectPath, "node_modules", "core", "package.json"),
            JSON.stringify({ name: "core", version: "0.0.1" }, null, 2)
        );
        fs.writeFileSync(
            path.join(projectPath, "node_modules", "core", "dist", "index.js"),
            "42;\n"
        );
        fs.writeFileSync(
            path.join(projectPath, "node_modules", "core", "dist", "index.d.ts"),
            "export declare const x: number;\n"
        );
        fs.writeFileSync(path.join(projectPath, "node_modules", "core", "README.md"), "# core\n");

        const project = await createMockProject(projectPath);
        const bundle = await project.getFlashFiles();

        expect(Object.keys(bundle.files)).to.have.members([
            "package.json",
            "build/index.js",
            "build/examples/nested.js",
            "node_modules/core/package.json",
            "node_modules/core/dist/index.js",
        ]);
    });

    it("should default missing files to npm-style wildcard behavior", async () => {
        const projectPath = path.join(tempDir, "project");
        fs.mkdirSync(path.join(projectPath, "build"), { recursive: true });
        fs.mkdirSync(path.join(projectPath, "node_modules", "core"), { recursive: true });

        fs.writeFileSync(
            path.join(projectPath, "package.json"),
            JSON.stringify(
                {
                    name: "test-project",
                    version: "0.0.1",
                    dependencies: {},
                },
                null,
                2
            )
        );
        fs.writeFileSync(path.join(projectPath, "build", "index.js"), "42;\n");
        fs.writeFileSync(path.join(projectPath, ".env"), "SECRET=1\n");
        fs.writeFileSync(
            path.join(projectPath, "node_modules", "core", "package.json"),
            JSON.stringify({ name: "core", version: "0.0.1" }, null, 2)
        );
        fs.writeFileSync(path.join(projectPath, "node_modules", "core", "index.js"), "42;\n");

        const project = await createMockProject(projectPath);
        const bundle = await project.getFlashFiles();

        expect(bundle.files).to.have.property("package.json");
        expect(bundle.files).to.have.property("build/index.js");
        expect(bundle.files).to.have.property("node_modules/core/package.json");
        expect(bundle.files).to.have.property("node_modules/core/index.js");
        expect(bundle.files).to.not.have.property(".env");
    });
});
