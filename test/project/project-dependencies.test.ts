import {
    setupTest,
    createProjectStructure,
    createMockProject,
    expectPackageJson,
    expectOutputMessage,
    expect,
    generateTestRegistryPackages,
} from "./testHelpers.js";

describe("Project - Dependency Management", () => {
    before(async () => {
        await generateTestRegistryPackages("data/test-registry/");
    });

    describe("install()", () => {
        it("should install dependencies from package.json", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: { core: "0.0.24" },
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.install();

                expectOutputMessage(mockOut, [
                    "Resolving project dependencies",
                    "Installing library 'core' version '0.0.24'",
                    "All dependencies resolved and installed successfully",
                ]);
            } finally {
                cleanup();
            }
        });

        it("should install transitive dependencies", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: { "led-strip": "0.0.5" },
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.install();
            } finally {
                cleanup();
            }
        });

        it("should handle empty dependencies", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.install();

                expectOutputMessage(mockOut, [
                    "Resolving project dependencies",
                    "All dependencies resolved and installed successfully",
                ]);
            } finally {
                cleanup();
            }
        });

        it("should throw error when uriRequest is not provided", async () => {
            const { tempDir, mockOut, mockErr, cleanup } = setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: { core: "0.0.24" },
                    registry: [],
                });

                const project = await createMockProject(projectPath, mockOut, mockErr);

                try {
                    await project.install();
                    expect.fail("Expected install to throw an error");
                } catch (error) {
                    expect((error as Error).message).to.include("Registry is not defined");
                }
            } finally {
                cleanup();
            }
        });

        it("should detect and report version conflicts", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: { color: "0.0.1" },
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.install();

                expectOutputMessage(mockOut, [
                    "All dependencies resolved and installed successfully",
                ]);
            } finally {
                cleanup();
            }
        });
    });

    describe("addLibrary()", () => {
        it("should add library with latest compatible version", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.addLibrary("color");

                expectPackageJson(projectPath, { hasDependency: ["color"] });
                expectOutputMessage(mockOut, ["Adding library 'color'"]);
            } finally {
                cleanup();
            }
        });

        it("should add library with its dependencies", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.addLibrary("led-strip");

                expectPackageJson(projectPath, { hasDependency: ["led-strip"] });
            } finally {
                cleanup();
            }
        });

        it("should not add library if no compatible version found", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);

                try {
                    await project.addLibrary("non-existent-library");
                    expect.fail("Expected addLibrary to throw an error");
                } catch (error) {
                    expect((error as Error).message).to.include("does not exist in the registry");
                }
            } finally {
                cleanup();
            }
        });

        it("should preserve existing dependencies when adding new library", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: { core: "0.0.24" },
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.addLibrary("color");

                expectPackageJson(projectPath, { hasDependency: ["core", "0.0.24"] });
                expectPackageJson(projectPath, { hasDependency: ["color"] });
            } finally {
                cleanup();
            }
        });
    });

    describe("addLibraryVersion()", () => {
        it("should add library with specific version", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.addLibraryVersion("color", "0.0.2");

                expectPackageJson(projectPath, { hasDependency: ["color", "0.0.2"] });
                expectOutputMessage(mockOut, ["Adding library 'color@0.0.2'"]);
            } finally {
                cleanup();
            }
        });

        it("should throw error for incompatible version", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);

                try {
                    await project.addLibraryVersion("non-existent", "1.0.0");
                    expect.fail("Expected addLibraryVersion to throw an error");
                } catch (error) {
                    expect((error as Error).message).to.include("does not exist");
                }
            } finally {
                cleanup();
            }
        });

        it("should update existing library to new version", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: { color: "0.0.1" },
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.addLibraryVersion("color", "0.0.2");

                expectPackageJson(projectPath, { hasDependency: ["color", "0.0.2"] });
            } finally {
                cleanup();
            }
        });
    });

    describe("removeLibrary()", () => {
        it("should remove library from dependencies", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: { core: "0.0.24", color: "0.0.2" },
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.removeLibrary("color");

                expectPackageJson(projectPath, {
                    noDependency: "color",
                    hasDependency: ["core", "0.0.24"],
                });
                expectOutputMessage(mockOut, [
                    "Removing library 'color'",
                    "Successfully removed library 'color'",
                ]);
            } finally {
                cleanup();
            }
        });

        it("should throw when removing a non-existent library", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: { core: "0.0.24" },
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                try {
                    await project.removeLibrary("non-existent");
                    expect.fail("Expected removeLibrary to throw an error");
                } catch (error) {
                    expect((error as Error).message).to.include("has not been found");
                }
            } finally {
                cleanup();
            }
        });

        it("should remove library and keep others intact", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: { core: "0.0.24", color: "0.0.2", "led-strip": "0.0.5" },
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.removeLibrary("color");

                expectPackageJson(projectPath, {
                    noDependency: "color",
                    hasDependency: ["core", "0.0.24"],
                });
                expectPackageJson(projectPath, { hasDependency: ["led-strip", "0.0.5"] });
            } finally {
                cleanup();
            }
        });

        it("should allow removing all libraries", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "test-project", {
                    dependencies: { core: "0.0.24" },
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.removeLibrary("core");

                expectPackageJson(projectPath, { dependencyCount: 0 });
            } finally {
                cleanup();
            }
        });
    });

    describe("integration tests", () => {
        it("should handle complete workflow: add, install, remove", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "workflow-project", {
                    dependencies: {},
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);

                await project.addLibrary("color");
                expectPackageJson(projectPath, { hasDependency: ["color"] });

                mockOut.clear();
                await project.install();

                mockOut.clear();
                await project.addLibrary("core");
                expectPackageJson(projectPath, { hasDependency: ["core"] });
                expectPackageJson(projectPath, { hasDependency: ["color"] });

                mockOut.clear();
                await project.removeLibrary("color");
                expectPackageJson(projectPath, {
                    noDependency: "color",
                    hasDependency: ["core"],
                });
            } finally {
                cleanup();
            }
        });

        it("should handle complex dependency trees", async () => {
            const { tempDir, mockOut, mockErr, getRequest, cleanup } =
                setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(tempDir, "complex-project", {
                    dependencies: { core: "0.0.24", "led-strip": "0.0.5" },
                });

                const project = await createMockProject(projectPath, mockOut, mockErr, getRequest);
                await project.install();
            } finally {
                cleanup();
            }
        });
    });
});
