import {
    setupTest,
    createProjectStructure,
    createMockProject,
    createMockRegistry,
    expectPackageJson,
    expectOutputMessage,
    expectAsyncError,
    generateTestRegistryPackages,
} from "./testHelpers.js";

async function createDependencyContext(
    env: ReturnType<typeof setupTest>,
    dependencies: Record<string, string> = {},
    projectName: string = "test-project"
) {
    const projectPath = createProjectStructure(env.tempDir, projectName, { dependencies });
    const project = await createMockProject(projectPath, env.mockOut, env.mockErr, env.logger);
    const registry = await createMockRegistry(
        projectPath,
        env.mockOut,
        env.mockErr,
        env.getRequest,
        env.logger
    );

    return { projectPath, project, registry };
}

describe("Project - Dependency Management", () => {
    before(async () => {
        await generateTestRegistryPackages("data/test-registry/");
    });

    describe("install()", () => {
        it("should install dependencies from package.json", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { project, registry } = await createDependencyContext(env, {
                    core: "0.0.24",
                });
                await project.install(registry);

                expectOutputMessage(env.mockOut, [
                    "Resolving project dependencies",
                    "Installing library 'core' version '0.0.24'",
                    "All dependencies resolved and installed successfully",
                ]);
            } finally {
                env.cleanup();
            }
        });

        it("should install transitive dependencies", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { project, registry } = await createDependencyContext(env, {
                    "led-strip": "0.0.5",
                });
                await project.install(registry);
            } finally {
                env.cleanup();
            }
        });

        it("should handle empty dependencies", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { project, registry } = await createDependencyContext(env);
                await project.install(registry);

                expectOutputMessage(env.mockOut, [
                    "Resolving project dependencies",
                    "All dependencies resolved and installed successfully",
                ]);
            } finally {
                env.cleanup();
            }
        });

        it("should throw error when resolved dependencies are requested without a registry", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const projectPath = createProjectStructure(env.tempDir, "test-project", {
                    dependencies: { core: "0.0.24" },
                });
                const project = await createMockProject(
                    projectPath,
                    env.mockOut,
                    env.mockErr,
                    env.logger
                );

                await expectAsyncError(
                    () => project.installedLibraries(true),
                    "Registry instance is required",
                    "Expected installedLibraries() to throw an error"
                );
            } finally {
                env.cleanup();
            }
        });

        it("should detect and report version conflicts", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { project, registry } = await createDependencyContext(env, {
                    color: "0.0.1",
                });
                await project.install(registry);

                expectOutputMessage(env.mockOut, [
                    "All dependencies resolved and installed successfully",
                ]);
            } finally {
                env.cleanup();
            }
        });
    });

    describe("addLibrary()", () => {
        it("should add library with latest compatible version", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { projectPath, project, registry } = await createDependencyContext(env);
                await project.addLibrary(registry, "color");

                expectPackageJson(projectPath, { hasDependency: ["color"] });
                expectOutputMessage(env.mockOut, ["Adding library 'color'"]);
            } finally {
                env.cleanup();
            }
        });

        it("should add library with its dependencies", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { projectPath, project, registry } = await createDependencyContext(env);
                await project.addLibrary(registry, "led-strip");

                expectPackageJson(projectPath, { hasDependency: ["led-strip"] });
            } finally {
                env.cleanup();
            }
        });

        it("should not add library if no compatible version found", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { project, registry } = await createDependencyContext(env);

                await expectAsyncError(
                    () => project.addLibrary(registry, "non-existent-library"),
                    "does not exist in the registry",
                    "Expected addLibrary to throw an error"
                );
            } finally {
                env.cleanup();
            }
        });

        it("should preserve existing dependencies when adding new library", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { projectPath, project, registry } = await createDependencyContext(env, {
                    core: "0.0.24",
                });
                await project.addLibrary(registry, "color");

                expectPackageJson(projectPath, { hasDependency: ["core", "0.0.24"] });
                expectPackageJson(projectPath, { hasDependency: ["color"] });
            } finally {
                env.cleanup();
            }
        });
    });

    describe("addLibraryVersion()", () => {
        it("should add library with specific version", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { projectPath, project, registry } = await createDependencyContext(env);
                await project.addLibraryVersion(registry, "color", "0.0.2");

                expectPackageJson(projectPath, { hasDependency: ["color", "0.0.2"] });
                expectOutputMessage(env.mockOut, ["Adding library 'color@0.0.2'"]);
            } finally {
                env.cleanup();
            }
        });

        it("should throw error for incompatible version", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { project, registry } = await createDependencyContext(env);

                await expectAsyncError(
                    () => project.addLibraryVersion(registry, "non-existent", "1.0.0"),
                    "does not exist",
                    "Expected addLibraryVersion to throw an error"
                );
            } finally {
                env.cleanup();
            }
        });

        it("should update existing library to new version", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { projectPath, project, registry } = await createDependencyContext(env, {
                    color: "0.0.1",
                });
                await project.addLibraryVersion(registry, "color", "0.0.2");

                expectPackageJson(projectPath, { hasDependency: ["color", "0.0.2"] });
            } finally {
                env.cleanup();
            }
        });
    });

    describe("removeLibrary()", () => {
        it("should remove library from dependencies", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { projectPath, project, registry } = await createDependencyContext(env, {
                    core: "0.0.24",
                    color: "0.0.2",
                });
                await project.removeLibrary(registry, "color");

                expectPackageJson(projectPath, {
                    noDependency: "color",
                    hasDependency: ["core", "0.0.24"],
                });
                expectOutputMessage(env.mockOut, [
                    "Removing library 'color'",
                    "Successfully removed library 'color'",
                ]);
            } finally {
                env.cleanup();
            }
        });

        it("should throw when removing a non-existent library", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { project, registry } = await createDependencyContext(env, {
                    core: "0.0.24",
                });
                await expectAsyncError(
                    () => project.removeLibrary(registry, "non-existent"),
                    "has not been found",
                    "Expected removeLibrary to throw an error"
                );
            } finally {
                env.cleanup();
            }
        });

        it("should remove library and keep others intact", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { projectPath, project, registry } = await createDependencyContext(env, {
                    core: "0.0.24",
                    color: "0.0.2",
                    "led-strip": "0.0.5",
                });
                await project.removeLibrary(registry, "color");

                expectPackageJson(projectPath, {
                    noDependency: "color",
                    hasDependency: ["core", "0.0.24"],
                });
                expectPackageJson(projectPath, { hasDependency: ["led-strip", "0.0.5"] });
            } finally {
                env.cleanup();
            }
        });

        it("should allow removing all libraries", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { projectPath, project, registry } = await createDependencyContext(env, {
                    core: "0.0.24",
                });
                await project.removeLibrary(registry, "core");

                expectPackageJson(projectPath, { dependencyCount: 0 });
            } finally {
                env.cleanup();
            }
        });
    });

    describe("integration tests", () => {
        it("should handle complete workflow: add, install, remove", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { projectPath, project, registry } = await createDependencyContext(
                    env,
                    {},
                    "workflow-project"
                );

                await project.addLibrary(registry, "color");
                expectPackageJson(projectPath, { hasDependency: ["color"] });

                env.mockOut.clear();
                await project.install(registry);

                env.mockOut.clear();
                await project.addLibrary(registry, "core");
                expectPackageJson(projectPath, { hasDependency: ["core"] });
                expectPackageJson(projectPath, { hasDependency: ["color"] });

                env.mockOut.clear();
                await project.removeLibrary(registry, "color");
                expectPackageJson(projectPath, {
                    noDependency: "color",
                    hasDependency: ["core"],
                });
            } finally {
                env.cleanup();
            }
        });

        it("should handle complex dependency trees", async () => {
            const env = setupTest("jaculus-deps-test-");

            try {
                const { project, registry } = await createDependencyContext(
                    env,
                    { core: "0.0.24", "led-strip": "0.0.5" },
                    "complex-project"
                );
                await project.install(registry);
            } finally {
                env.cleanup();
            }
        });
    });
});
