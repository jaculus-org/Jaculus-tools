import { copyFolder } from "@jaculus/project/fs";
import * as chai from "chai";
import * as path from "path";
import { compile } from "@jaculus/project/compiler";
import * as fsReal from "fs";
import { tmpdir } from "os";
import { configure, umount, InMemory, fs as fsVirt } from "@zenfs/core";
import { fileURLToPath } from "url";

const expect = chai.expect;
const testProjectPath = path.resolve("./test/project/data/test-project");

interface TestConfig {
    name: string;
    fs: any;
    setup: () => Promise<{ inputPath: string; tsLibsPath?: string }>;
    cleanup: () => Promise<void>;
}

describe("TypeScript Compiler", () => {
    const configs: TestConfig[] = [
        // Node.js filesystem configuration
        {
            name: "Node.js FS",
            fs: fsReal,
            setup: async () => {
                const tempDir = fsReal.mkdtempSync(path.join(tmpdir(), "jaculus-test-"));
                await copyFolder(fsReal, testProjectPath, fsReal, tempDir);
                return { inputPath: tempDir };
            },
            cleanup: async () => {},
        },
        // Virtual filesystem configuration
        {
            name: "Virtual FS",
            fs: fsVirt,
            setup: async () => {
                const pathPrefix = "/project/";
                const tsLibsPath = "/tsLibs/";

                await configure({
                    mounts: {
                        [pathPrefix]: InMemory,
                        [tsLibsPath]: InMemory,
                    },
                });

                const tsLibsSource = path.dirname(
                    fileURLToPath(import.meta.resolve?.("typescript") ?? "typescript")
                );
                await copyFolder(fsReal, tsLibsSource, fsVirt as any, tsLibsPath, false);
                await copyFolder(fsReal, testProjectPath, fsVirt as any, pathPrefix);

                return { inputPath: pathPrefix, tsLibsPath };
            },
            cleanup: async () => {
                umount("/project/");
                umount("/tsLibs/");
            },
        },
    ];

    configs.forEach((config) => {
        describe(`${config.name}`, () => {
            let testData: { inputPath: string; tsLibsPath?: string };
            let tempDirs: string[] = [];

            beforeEach(async () => {
                testData = await config.setup();
            });

            afterEach(async () => {
                await config.cleanup();

                // Clean up any temporary directories created for Node.js tests
                tempDirs.forEach((dir) => {
                    if (fsReal.existsSync(dir)) {
                        fsReal.rmSync(dir, { recursive: true, force: true });
                    }
                });
                tempDirs = [];
            });

            it("should successfully compile a simple TypeScript project", async () => {
                let errorOutput = "";
                const errorStream = {
                    write: (chunk: string) => {
                        errorOutput += chunk;
                    },
                };

                const result = await compile(
                    config.fs,
                    testData.inputPath,
                    "build",
                    errorStream,
                    undefined,
                    testData.tsLibsPath
                );

                if (!result) {
                    console.log("Compilation errors:", errorOutput);
                }

                expect(result).to.be.true;
                expect(errorOutput).to.be.empty;

                const buildExists = config.fs.existsSync(path.join(testData.inputPath, "build"));
                expect(buildExists).to.be.true;

                const indexJsExists = config.fs.existsSync(
                    path.join(testData.inputPath, "build", "index.js")
                );
                expect(indexJsExists).to.be.true;

                const compiledContent = config.fs.readFileSync(
                    path.join(testData.inputPath, "build", "index.js"),
                    "utf-8"
                );
                expect(compiledContent).to.include("gpio");
                expect(compiledContent).to.include("LED_PIN");
                expect(compiledContent).to.include("setInterval");
            });

            it("should handle compilation errors gracefully", async () => {
                // Create a temporary directory for this test
                let testDir: string;
                if (config.name === "Node.js FS") {
                    testDir = fsReal.mkdtempSync(path.join(tmpdir(), "jaculus-error-test-"));
                    tempDirs.push(testDir);
                } else {
                    testDir = "/error-test/";
                }

                config.fs.mkdirSync(testDir, { recursive: true });
                config.fs.mkdirSync(path.join(testDir, "src"), { recursive: true });

                const tsconfig = {
                    compilerOptions: {
                        target: "es2023",
                        module: "es2022",
                        lib: ["es2023"],
                        moduleResolution: "node",
                        sourceMap: false,
                        outDir: "build",
                        rootDir: "src",
                    },
                };

                if (config.fs.writeFileSync) {
                    config.fs.writeFileSync(
                        path.join(testDir, "tsconfig.json"),
                        JSON.stringify(tsconfig, null, 2)
                    );
                } else {
                    await config.fs.promises.writeFile(
                        path.join(testDir, "tsconfig.json"),
                        JSON.stringify(tsconfig, null, 2)
                    );
                }

                const invalidCode = `
                    import * as gpio from "gpio";

                    // This should cause a compilation error
                    const LED_PIN: number = "not a number";

                    gpio.pinMode(LED_PIN, gpio.PinMode.OUTPUT);
                `;

                config.fs.writeFileSync(path.join(testDir, "src", "index.ts"), invalidCode);

                let errorOutput = "";
                const errorStream = {
                    write: (chunk: string) => {
                        errorOutput += chunk;
                    },
                };

                const result = await compile(
                    config.fs,
                    testDir,
                    "build",
                    errorStream,
                    undefined,
                    testData.tsLibsPath
                );

                expect(result).to.be.false;
                expect(errorOutput).to.not.be.empty;
                expect(errorOutput).to.include("not assignable to type");
            });

            it("should throw error when tsconfig.json is missing", async () => {
                let testDir: string;
                if (config.name === "Node.js FS") {
                    testDir = fsReal.mkdtempSync(
                        path.join(tmpdir(), "jaculus-missing-config-test-")
                    );
                    tempDirs.push(testDir);
                } else {
                    testDir = "/missing-config-test/";
                }

                config.fs.mkdirSync(testDir, { recursive: true });
                config.fs.mkdirSync(path.join(testDir, "src"), { recursive: true });

                const errorStream = {
                    write: () => {},
                };

                try {
                    await compile(
                        config.fs,
                        testDir,
                        "build",
                        errorStream,
                        undefined,
                        testData.tsLibsPath
                    );
                    expect.fail("Expected compile to throw an error");
                } catch (error) {
                    expect(error).to.be.an("error");
                    expect((error as Error).message).to.include("Could not find tsconfig.json");
                }
            });
        });
    });
});
