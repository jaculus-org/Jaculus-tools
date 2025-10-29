import { Project, ProjectPackage } from "@jaculus/project";
import { setupTest, createProject, expectOutput, expect, fs } from "./testHelpers.js";

describe("Project - Package Operations", () => {
    describe("constructor", () => {
        it("should create Project instance with required parameters", () => {
            const { mockOut, mockErr, cleanup } = setupTest();

            try {
                const project = createProject("/test/path", mockOut, mockErr);

                expect(project).to.be.instanceOf(Project);
                expect(project.projectPath).to.equal("/test/path");
                expect(project.out).to.equal(mockOut);
                expect(project.err).to.equal(mockErr);
                expect(project.uriRequest).to.be.undefined;
            } finally {
                cleanup();
            }
        });

        it("should create Project instance with optional uriRequest", () => {
            const { mockOut, mockErr, getRequest, cleanup } = setupTest();

            try {
                const project = createProject("/test/path", mockOut, mockErr, getRequest);
                expect(project.uriRequest).to.equal(getRequest);
            } finally {
                cleanup();
            }
        });
    });

    describe("unpackPackage()", () => {
        it("should unpack package with files and directories", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;
                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["src", "lib"],
                    files: {
                        "src/index.js": new TextEncoder().encode("console.log('hello');"),
                        "lib/utils.js": new TextEncoder().encode("export const helper = () => {};"),
                        "package.json": new TextEncoder().encode('{"name": "test"}'),
                    },
                };

                await project.unpackPackage(pkg, () => true, false);

                expectOutput(mockOut, ["Create"]);
            } finally {
                cleanup();
            }
        });

        it("should respect filter function", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;
                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: [],
                    files: {
                        "src/index.js": new TextEncoder().encode("included"),
                        "src/test.js": new TextEncoder().encode("excluded"),
                        "package.json": new TextEncoder().encode('{"name": "test"}'),
                    },
                };

                const filter = (fileName: string) => !fileName.includes("test.js");
                await project.unpackPackage(pkg, filter, false);

                expectOutput(mockOut, ["[skip]", "test.js"]);
            } finally {
                cleanup();
            }
        });

        it("should handle dry-run mode", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;
                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["src"],
                    files: {
                        "src/index.js": new TextEncoder().encode("test"),
                    },
                };

                await project.unpackPackage(pkg, () => true, true);
                expectOutput(mockOut, ["[dry-run]"]);
            } finally {
                cleanup();
            }
        });

        it("should overwrite existing files", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;
                const project = createProject(projectPath, mockOut, mockErr);

                // Create a pre-existing file first
                fs.mkdirSync(`${projectPath}/src`, { recursive: true });
                fs.writeFileSync(`${projectPath}/src/index.js`, "existing content");

                const pkg: ProjectPackage = {
                    dirs: [],
                    files: {
                        "src/index.js": new TextEncoder().encode("new content"),
                    },
                };

                await project.unpackPackage(pkg, () => true, false);
                expectOutput(mockOut, ["Overwrite"]);
            } finally {
                cleanup();
            }
        });

        it("should create nested directories", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;
                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["src/lib/utils"],
                    files: {
                        "src/lib/utils/helper.js": new TextEncoder().encode("test"),
                    },
                };

                await project.unpackPackage(pkg, () => true, false);
                expectOutput(mockOut, ["Create"]);
            } finally {
                cleanup();
            }
        });
    });

    describe("createFromPackage()", () => {
        it("should create new project from package", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/new-project`;
                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["src"],
                    files: {
                        "src/index.js": new TextEncoder().encode("console.log('hello');"),
                        "package.json": new TextEncoder().encode('{"name": "test"}'),
                        "manifest.json": new TextEncoder().encode('{"version": "1.0.0"}'),
                    },
                };

                await project.createFromPackage(pkg, false);
                expectOutput(mockOut, ["[skip]", "manifest.json"]);
            } finally {
                cleanup();
            }
        });

        it("should throw error if project directory already exists", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/existing-project`;
                // Create the project directory first so it "already exists"
                fs.mkdirSync(projectPath, { recursive: true });

                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: [],
                    files: {
                        "package.json": new TextEncoder().encode('{"name": "test"}'),
                    },
                };

                try {
                    await project.createFromPackage(pkg, false);
                    expect.fail("Expected createFromPackage to throw an error");
                } catch (error) {
                    expect(error).to.equal(1);
                    expectOutput(mockErr, ["already exists"]);
                }
            } finally {
                cleanup();
            }
        });

        it("should handle dry-run mode", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/dry-run-project`;
                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["src"],
                    files: {
                        "src/index.js": new TextEncoder().encode("test"),
                    },
                };

                await project.createFromPackage(pkg, true);
                expectOutput(mockOut, ["[dry-run]"]);
            } finally {
                cleanup();
            }
        });
    });

    describe("updateFromPackage()", () => {
        it("should update existing project with skeleton files", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/update-project`;
                // Create the project directory first
                fs.mkdirSync(projectPath, { recursive: true });

                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["@types"],
                    files: {
                        "@types/stdio.d.ts": new TextEncoder().encode("declare module 'stdio';"),
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                        "src/index.js": new TextEncoder().encode("updated"),
                        "manifest.json": new TextEncoder().encode(
                            '{"skeletonFiles": ["@types/*", "tsconfig.json"]}'
                        ),
                    },
                };

                await project.updateFromPackage(pkg, false);
                // Test passes if no errors are thrown
            } finally {
                cleanup();
            }
        });

        it("should use default skeleton if manifest doesn't exist", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/update-project`;
                // Create the project directory first
                fs.mkdirSync(projectPath, { recursive: true });

                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["@types"],
                    files: {
                        "@types/stdio.d.ts": new TextEncoder().encode("declare module 'stdio';"),
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                        "src/index.js": new TextEncoder().encode("code"),
                    },
                };

                await project.updateFromPackage(pkg, false);
                // Test passes if no errors are thrown
            } finally {
                cleanup();
            }
        });

        it("should throw error if project directory doesn't exist", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/non-existent`;
                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: [],
                    files: {},
                };

                try {
                    await project.updateFromPackage(pkg, false);
                    expect.fail("Expected updateFromPackage to throw an error");
                } catch (error) {
                    expect(error).to.equal(1);
                    expectOutput(mockErr, ["does not exist"]);
                }
            } finally {
                cleanup();
            }
        });

        it("should throw error if path is not a directory", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/not-a-dir`;
                // Create a file (not a directory) at the project path
                fs.writeFileSync(projectPath, "I am a file, not a directory");

                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: [],
                    files: {},
                };

                try {
                    await project.updateFromPackage(pkg, false);
                    expect.fail("Expected updateFromPackage to throw an error");
                } catch (error) {
                    expect(error).to.equal(1);
                    expectOutput(mockErr, ["is not a directory"]);
                }
            } finally {
                cleanup();
            }
        });

        it("should handle custom skeleton files from manifest", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/custom-skeleton`;
                // Create the project directory first
                fs.mkdirSync(projectPath, { recursive: true });

                const project = createProject(projectPath, mockOut, mockErr);

                const manifest = {
                    skeletonFiles: ["*.config.js", "types/*.d.ts"],
                };

                const pkg: ProjectPackage = {
                    dirs: ["types"],
                    files: {
                        "vite.config.js": new TextEncoder().encode("export default {}"),
                        "types/custom.d.ts": new TextEncoder().encode("declare module 'custom';"),
                        "src/index.js": new TextEncoder().encode("code"),
                        "manifest.json": new TextEncoder().encode(JSON.stringify(manifest)),
                    },
                };

                await project.updateFromPackage(pkg, false);
                // Test passes if no errors are thrown
            } finally {
                cleanup();
            }
        });

        it("should throw error for invalid skeleton entry in manifest", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/invalid-skeleton`;
                // Create the project directory for the test
                fs.mkdirSync(projectPath, { recursive: true });

                const project = createProject(projectPath, mockOut, mockErr);

                const manifest = {
                    skeletonFiles: ["valid.js", { invalid: "object" }, "another.js"],
                };

                const pkg: ProjectPackage = {
                    dirs: [],
                    files: {
                        "manifest.json": new TextEncoder().encode(JSON.stringify(manifest)),
                    },
                };

                try {
                    await project.updateFromPackage(pkg, false);
                    expect.fail("Expected updateFromPackage to throw an error");
                } catch (error) {
                    expect(error).to.equal(1);
                    expectOutput(mockErr, ["Invalid skeleton entry"]);
                }
            } finally {
                cleanup();
            }
        });

        it("should handle dry-run mode", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/dry-update`;
                // Create the project directory first
                fs.mkdirSync(projectPath, { recursive: true });

                const project = createProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["@types"],
                    files: {
                        "@types/stdio.d.ts": new TextEncoder().encode("declare module 'stdio';"),
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                    },
                };

                await project.updateFromPackage(pkg, true);
                expectOutput(mockOut, ["[dry-run]"]);
            } finally {
                cleanup();
            }
        });
    });
});
