import * as chai from "chai";
import * as path from "path";
import * as fsReal from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { configure, umount, InMemory, fs as fsVirt } from "@zenfs/core";
import { compileProjectPath } from "../../packages/project/src/compiler/index.js";
import { copyFolder } from "../../packages/project/src/fs.js";
import { createMockLogger, expectAsyncError } from "./testHelpers.js";

const expect = chai.expect;
const testProjectPath = path.resolve("./test/project/data/test-project");
const require = createRequire(import.meta.url);
const tsLibsSource = path.dirname(require.resolve("typescript"));

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
                return { inputPath: tempDir, tsLibsPath: tsLibsSource };
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
                tempDirs.forEach((dir) => {
                    if (fsReal.existsSync(dir)) {
                        fsReal.rmSync(dir, { recursive: true, force: true });
                    }
                });
                tempDirs = [];
            });

            it("should successfully compile a simple TypeScript project", async () => {
                const logger = createMockLogger();

                const result = await compileProjectPath(
                    config.fs,
                    testData.inputPath,
                    logger,
                    undefined,
                    testData.tsLibsPath
                );

                expect(result).to.be.true;
                expect(logger.output(["error", "warn"])).to.be.empty;
                expect(logger.output(["info", "verbose", "debug", "silly"])).to.include(
                    "Compiling files:"
                );

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

                const logger = createMockLogger();

                const result = await compileProjectPath(
                    config.fs,
                    testDir,
                    logger,
                    undefined,
                    testData.tsLibsPath
                );

                expect(result).to.be.false;
                expect(logger.output(["error", "warn"])).to.not.be.empty;
                expect(logger.output(["error", "warn"])).to.include("not assignable to type");
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

                const logger = createMockLogger();

                await expectAsyncError(
                    () =>
                        compileProjectPath(
                            config.fs,
                            testDir,
                            logger,
                            undefined,
                            testData.tsLibsPath
                        ),
                    "Could not find tsconfig.json",
                    "Expected compile to throw an error"
                );
            });
        });
    });
});
