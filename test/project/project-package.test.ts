import { Project, ProjectPackage } from "@jaculus/project";
import {
    setupTest,
    createMockProject,
    expectOutputMessage,
    expect,
    fs,
    createProjectStructure,
} from "./testHelpers.js";

describe("Project - Package Operations", () => {
    describe("constructor", () => {
        it("should create Project instance with required parameters", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });
                const project = await createMockProject(projectPath, mockOut, mockErr);

                expect(project).to.be.instanceOf(Project);
                expect(project.projectPath).to.equal(projectPath);
                expect(project.out).to.equal(mockOut);
                expect(project.err).to.equal(mockErr);
                expect(project.registry).to.be.undefined;
            } finally {
                cleanup();
            }
        });

        it("should create Project instance with optional uriRequest", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });
                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                expect(project.registry).to.not.be.undefined;
            } finally {
                cleanup();
            }
        });
    });

    describe("createFromPackage()", () => {
        it("should create project with files and directories", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;
                const project = new Project(fs, projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["src", "lib"],
                    files: {
                        "src/index.js": new TextEncoder().encode("console.log('hello');"),
                        "lib/utils.js": new TextEncoder().encode("export const helper = () => {};"),
                        "package.json": new TextEncoder().encode('{"name": "test"}'),
                        "manifest.json": new TextEncoder().encode('{"version": "1.0.0"}'),
                    },
                };

                await project.createFromPackage(pkg, false);

                expectOutputMessage(mockOut, ["Create"]);
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
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;
                const project = new Project(fs, projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["src"],
                    files: {
                        "src/index.js": new TextEncoder().encode("test"),
                    },
                };

                await project.createFromPackage(pkg, true);
                expectOutputMessage(mockOut, ["[dry-run]"]);
                expect(fs.existsSync(projectPath)).to.be.false;
            } finally {
                cleanup();
            }
        });

        it("should overwrite existing files", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });
                const project = await createMockProject(projectPath, mockOut, mockErr);

                fs.mkdirSync(`${projectPath}/src`, { recursive: true });
                fs.writeFileSync(`${projectPath}/src/index.js`, "existing content");

                const pkg: ProjectPackage = {
                    dirs: [],
                    files: {
                        "src/index.js": new TextEncoder().encode("new content"),
                        "manifest.json": new TextEncoder().encode('{"skeletonFiles": ["src/*"]}'),
                    },
                };

                await project.updateFromPackage(pkg, false);
                expectOutputMessage(mockOut, ["Overwrite"]);
                const content = fs.readFileSync(`${projectPath}/src/index.js`, "utf-8");
                expect(content).to.equal("new content");
            } finally {
                cleanup();
            }
        });

        it("should create nested directories", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/test-project`;
                const project = new Project(fs, projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["src/lib/utils"],
                    files: {
                        "src/lib/utils/helper.js": new TextEncoder().encode("test"),
                    },
                };

                await project.createFromPackage(pkg, false);
                expectOutputMessage(mockOut, ["Create"]);
                expect(fs.existsSync(`${projectPath}/src/lib/utils`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/src/lib/utils/helper.js`)).to.be.true;
            } finally {
                cleanup();
            }
        });
        it("should throw error if project directory already exists", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/existing-project`;
                fs.mkdirSync(projectPath, { recursive: true });

                const project = new Project(fs, projectPath, mockOut, mockErr);

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
                    expect(error).to.be.an("error");
                    expect((error as Error).message).to.include("already exists");
                }
            } finally {
                cleanup();
            }
        });
    });

    describe("updateFromPackage()", () => {
        it("should filter files based on skeleton patterns", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });
                const project = await createMockProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: [],
                    files: {
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                        "src/index.js": new TextEncoder().encode("// should be filtered out"),
                        "manifest.json": new TextEncoder().encode(
                            '{"skeletonFiles": ["tsconfig.json"]}'
                        ),
                    },
                };

                await project.updateFromPackage(pkg, false);

                expectOutputMessage(mockOut, ["tsconfig.json"]);
                expect(fs.existsSync(`${projectPath}/tsconfig.json`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/src/index.js`)).to.be.false;
            } finally {
                cleanup();
            }
        });

        it("should update existing project with skeleton files", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "update-project", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["@types"],
                    files: {
                        "@types/stdio.d.ts": new TextEncoder().encode("declare module 'stdio';"),
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                        "src/index.js": new TextEncoder().encode("// this should be filtered out"),
                    },
                };

                await project.updateFromPackage(pkg, false);
                expectOutputMessage(mockOut, ["Create"]);
                expect(fs.existsSync(`${projectPath}/@types/stdio.d.ts`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/tsconfig.json`)).to.be.true;
                // src/index.js should be filtered out by default skeleton
                expect(fs.existsSync(`${projectPath}/src/index.js`)).to.be.false;
            } finally {
                cleanup();
            }
        });

        it("should use default skeleton if manifest doesn't exist", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "update-project", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["@types"],
                    files: {
                        "@types/stdio.d.ts": new TextEncoder().encode("declare module 'stdio';"),
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                        "src/index.js": new TextEncoder().encode("code"),
                    },
                };

                await project.updateFromPackage(pkg, false);
                expect(fs.existsSync(`${projectPath}/@types/stdio.d.ts`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/tsconfig.json`)).to.be.true;
            } finally {
                cleanup();
            }
        });

        it("should throw error if project directory doesn't exist", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/non-existent`;
                const project = new Project(fs, projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: [],
                    files: {},
                };

                try {
                    await project.updateFromPackage(pkg, false);
                    expect.fail("Expected updateFromPackage to throw an error");
                } catch (error) {
                    expect(error).to.be.an("error");
                    expect((error as Error).message).to.include("does not exist");
                }
            } finally {
                cleanup();
            }
        });

        it("should throw error if path is not a directory", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = `${tempDir}/not-a-dir`;
                fs.writeFileSync(projectPath, "I am a file, not a directory");

                const project = new Project(fs, projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: [],
                    files: {},
                };

                try {
                    await project.updateFromPackage(pkg, false);
                    expect.fail("Expected updateFromPackage to throw an error");
                } catch (error) {
                    expect(error).to.be.an("error");
                    expect((error as Error).message).to.include("is not a directory");
                }
            } finally {
                cleanup();
            }
        });

        it("should handle custom skeleton files from manifest", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "custom-skeleton", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr);

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
                expect(fs.existsSync(`${projectPath}/vite.config.js`)).to.be.true;
                expect(fs.existsSync(`${projectPath}/types/custom.d.ts`)).to.be.true;
                // src/index.js should be filtered out as it doesn't match the skeleton patterns
                expect(fs.existsSync(`${projectPath}/src/index.js`)).to.be.false;
            } finally {
                cleanup();
            }
        });

        it("should throw error for invalid skeleton entry in manifest", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "invalid-skeleton", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr);

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
                    expect(error).to.be.an("error");
                    expect((error as Error).message).to.include("Invalid skeleton entry");
                }
            } finally {
                cleanup();
            }
        });

        it("should handle dry-run mode", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-project-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "dry-update", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr);

                const pkg: ProjectPackage = {
                    dirs: ["@types"],
                    files: {
                        "@types/stdio.d.ts": new TextEncoder().encode("declare module 'stdio';"),
                        "tsconfig.json": new TextEncoder().encode('{"compilerOptions": {}}'),
                    },
                };

                await project.updateFromPackage(pkg, true);
                expectOutputMessage(mockOut, ["[dry-run]"]);
                expect(fs.existsSync(`${projectPath}/@types/stdio.d.ts`)).to.be.false;
                expect(fs.existsSync(`${projectPath}/tsconfig.json`)).to.be.false;
            } finally {
                cleanup();
            }
        });
    });
});
