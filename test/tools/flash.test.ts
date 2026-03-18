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
                getDirHashes: async () => {
                    throw new Error("unsupported");
                },
                uploadIfDifferent: async () => {
                    throw new Error("uploadIfDifferent should not be called in fallback mode");
                },
                deleteDirectory: async () => {},
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
});
