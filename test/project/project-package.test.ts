import { Project, ProjectBundle } from "@jaculus/project";
import { createFromBundle, updateFromBundle } from "@jaculus/project/creation";
import {
    setupTest,
    createMockProject,
    expectAsyncError,
    expectLoggerMessage,
    expect,
    fs,
    createProjectStructure,
} from "./testHelpers.js";

describe("Project - Package Operations", () => {
    describe("constructor", () => {
        it("should create Project instance with required parameters", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });
                const project = await createMockProject(projectPath, logger);

                expect(project).to.be.instanceOf(Project);
                expect(project.projectPath).to.equal(projectPath);
                expect(project.logger).to.equal(logger);
            } finally {
                cleanup();
            }
        });

        it("should create Project instance with explicit logger", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });
                const project = new Project(fs, projectPath, logger);
                expect(project.logger).to.equal(logger);
            } finally {
                cleanup();
            }
        });
    });

    describe("createFromPackage()", () => {
        it("should create project with files and directories", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;

                const bundle: ProjectBundle = {
                    dirs: new Set(["src", "lib"]),
                    files: {
                        "src/index.js": new TextEncoder().encode("console.log('hello');"),
                        "lib/utils.js": new TextEncoder().encode("export const helper = () => {};"),
                        "package.json": new TextEncoder().encode('{"name": "test"}'),
                        "manifest.json": new TextEncoder().encode('{"version": "1.0.0"}'),
                    },
                };

                await createFromBundle(fs, projectPath, bundle, logger, false);

                expectLoggerMessage(logger, ["Create"]);
                expect(fs.existsSync(`${projectPath}/src`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/lib`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/src/index.js`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/lib/utils.js`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/manifest.json`)).to.be.false;
            } finally {
                cleanup();
            }
        });

        it("should handle dry-run mode", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;

                const bundle: ProjectBundle = {
                    dirs: new Set(["src"]),
                    files: {
                        "src/index.js": new TextEncoder().encode("test"),
                    },
                };

                await createFromBundle(fs, projectPath, bundle, logger, true);
                expectLoggerMessage(logger, ["[dry-run]"]);
                expect(fs.existsSync(projectPath)).to.be.false;
            } finally {
                cleanup();
            }
        });

        it("should overwrite existing files", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });

                fs.mkdirSync(`${projectPath}/src`, { recursive: true });
                fs.writeFileSync(`${projectPath}/src/index.js`, "existing content");

                const bundle: ProjectBundle = {
                    dirs: new Set<string>(),
                    files: {
                        "src/index.js": new TextEncoder().encode("new content"),
                        "manifest.json": new TextEncoder().encode('{"skeletonFiles": ["src/*"]}'),
                    },
                };

                await updateFromBundle(fs, projectPath, bundle, logger, false);
                expectLoggerMessage(logger, ["Overwrite"]);
                const content = fs.readFileSync(`${projectPath}/src/index.js`, "utf-8");
                expect(content).to.equal("new content");
            } finally {
                cleanup();
            }
        });

        it("should create nested directories", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;

                const bundle: ProjectBundle = {
                    dirs: new Set(["src/lib/utils"]),
                    files: {
                        "src/lib/utils/helper.js": new TextEncoder().encode("test"),
                    },
                };

                await createFromBundle(fs, projectPath, bundle, logger, false);
                expectLoggerMessage(logger, ["Create"]);
                expect(fs.existsSync(`${projectPath}/src/lib/utils`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/src/lib/utils/helper.js`)).to.be.true;
            } finally {
                cleanup();
            }
        });
        it("should throw error if project directory already exists", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/existing-project`;
                fs.mkdirSync(projectPath, { recursive: true });

                const bundle: ProjectBundle = {
                    dirs: new Set<string>(),
                    files: {
                        "package.json": new TextEncoder().encode('{"name": "test"}'),
                    },
                };

                await expectAsyncError(
                    () => createFromBundle(fs, projectPath, bundle, logger, false),
                    "already exists",
                    "Expected createFromPackage to throw an error"
                );
            } finally {
                cleanup();
            }
        });
    });

    describe("updateFromPackage()", () => {
        it("should filter files based on skeleton patterns", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });

                const bundle: ProjectBundle = {
                    dirs: new Set<string>(),
                    files: {
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                        "src/index.js": new TextEncoder().encode("// should be filtered out"),
                        "manifest.json": new TextEncoder().encode(
                            '{"skeletonFiles": ["tsconfig.json"]}'
                        ),
                    },
                };

                await updateFromBundle(fs, projectPath, bundle, logger, false);

                expectLoggerMessage(logger, ["tsconfig.json"]);
                expect(fs.existsSync(`${projectPath}/tsconfig.json`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/src/index.js`)).to.be.false;
            } finally {
                cleanup();
            }
        });

        it("should update existing project with skeleton files", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "update-project", {
                    dependencies: {},
                });

                const bundle: ProjectBundle = {
                    dirs: new Set(["@types"]),
                    files: {
                        "@types/stdio.d.ts": new TextEncoder().encode("declare module 'stdio';"),
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                        "src/index.js": new TextEncoder().encode("// this should be filtered out"),
                    },
                };

                await updateFromBundle(fs, projectPath, bundle, logger, false);
                expectLoggerMessage(logger, ["Create"]);
                expect(fs.existsSync(`${projectPath}/@types/stdio.d.ts`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/tsconfig.json`)).to.be.true;
                // src/index.js should be filtered out by default skeleton
                expect(fs.existsSync(`${projectPath}/src/index.js`)).to.be.false;
            } finally {
                cleanup();
            }
        });

        it("should use default skeleton if manifest doesn't exist", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "update-project", {
                    dependencies: {},
                });

                const bundle: ProjectBundle = {
                    dirs: new Set(["@types"]),
                    files: {
                        "@types/stdio.d.ts": new TextEncoder().encode("declare module 'stdio';"),
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                        "src/index.js": new TextEncoder().encode("code"),
                    },
                };

                await updateFromBundle(fs, projectPath, bundle, logger, false);
                expect(fs.existsSync(`${projectPath}/@types/stdio.d.ts`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/tsconfig.json`)).to.be.true;
            } finally {
                cleanup();
            }
        });

        it("should throw error if project directory doesn't exist", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/non-existent`;

                const bundle: ProjectBundle = {
                    dirs: new Set<string>(),
                    files: {},
                };

                await expectAsyncError(
                    () => updateFromBundle(fs, projectPath, bundle, logger, false),
                    "does not exist",
                    "Expected updateFromPackage to throw an error"
                );
            } finally {
                cleanup();
            }
        });

        it("should throw error if path is not a directory", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/not-a-dir`;
                fs.writeFileSync(projectPath, "I am a file, not a directory");

                const bundle: ProjectBundle = {
                    dirs: new Set<string>(),
                    files: {},
                };

                await expectAsyncError(
                    () => updateFromBundle(fs, projectPath, bundle, logger, false),
                    "is not a directory",
                    "Expected updateFromPackage to throw an error"
                );
            } finally {
                cleanup();
            }
        });

        it("should handle custom skeleton files from manifest", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "custom-skeleton", {
                    dependencies: {},
                });

                const manifest = {
                    skeletonFiles: ["*.config.js", "types/*.d.ts"],
                };

                const bundle: ProjectBundle = {
                    dirs: new Set(["types"]),
                    files: {
                        "vite.config.js": new TextEncoder().encode("export default {}"),
                        "types/custom.d.ts": new TextEncoder().encode("declare module 'custom';"),
                        "src/index.js": new TextEncoder().encode("code"),
                        "manifest.json": new TextEncoder().encode(JSON.stringify(manifest)),
                    },
                };

                await updateFromBundle(fs, projectPath, bundle, logger, false);
                expect(fs.existsSync(`${projectPath}/vite.config.js`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/types/custom.d.ts`)).to.be.true;
                // src/index.js should be filtered out as it doesn't match the skeleton patterns
                expect(fs.existsSync(`${projectPath}/src/index.js`)).to.be.false;
            } finally {
                cleanup();
            }
        });

        it("should throw error for invalid skeleton entry in manifest", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "invalid-skeleton", {
                    dependencies: {},
                });

                const manifest = {
                    skeletonFiles: ["valid.js", { invalid: "object" }, "another.js"],
                };

                const bundle: ProjectBundle = {
                    dirs: new Set<string>(),
                    files: {
                        "manifest.json": new TextEncoder().encode(JSON.stringify(manifest)),
                    },
                };

                await expectAsyncError(
                    () => updateFromBundle(fs, projectPath, bundle, logger, false),
                    "Invalid skeleton entry",
                    "Expected updateFromPackage to throw an error"
                );
            } finally {
                cleanup();
            }
        });

        it("should handle dry-run mode", async () => {
            const { tempDir, logger, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "dry-update", {
                    dependencies: {},
                });

                const bundle: ProjectBundle = {
                    dirs: new Set(["@types"]),
                    files: {
                        "@types/stdio.d.ts": new TextEncoder().encode("declare module 'stdio';"),
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                    },
                };

                await updateFromBundle(fs, projectPath, bundle, logger, true);
                expectLoggerMessage(logger, ["[dry-run]"]);
                expect(fs.existsSync(`${projectPath}/@types/stdio.d.ts`)).to.be.false;
                expect(fs.existsSync(`${projectPath}/tsconfig.json`)).to.be.false;
            } finally {
                cleanup();
            }
        });
    });
});
