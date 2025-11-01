import { loadPackageJson, savePackageJson, PackageJson } from "@jaculus/project";
import { cleanupTestDir, createTestDir, expect, fs, path, mockFs } from "./testHelpers.js";

const projectBasePath = "data/test-project/";

describe("Package JSON", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTestDir("jaculus-package-test-");
    });

    afterEach(() => {
        cleanupTestDir(tempDir);
    });

    describe("loadPackageJson()", () => {
        it("should load valid package.json with all fields", async () => {
            const packageData: PackageJson = {
                name: "test-package",
                version: "1.0.0",
                description: "A test package",
                dependencies: {
                    core: "0.0.24",
                    "led-strip": "1.2.3",
                },
                jacly: ["src/main.js", "lib/utils.js"],
                registry: ["https://registry.example.com", "https://backup.registry.com"],
            };

            const packagePath = path.join(tempDir, "package.json");
            fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

            const loaded = await loadPackageJson(mockFs, path.join(tempDir, "package.json"));

            expect(loaded).to.deep.equal(packageData);
            expect(loaded.name).to.equal("test-package");
            expect(loaded.version).to.equal("1.0.0");
            expect(loaded.description).to.equal("A test package");
            expect(loaded.dependencies).to.have.property("core", "0.0.24");
            expect(loaded.dependencies).to.have.property("led-strip", "1.2.3");
            expect(loaded.jacly).to.be.an("array").that.includes("src/main.js");
            expect(loaded.registry).to.be.an("array").that.includes("https://registry.example.com");
        });

        it("should load minimal valid package.json with only dependencies", async () => {
            const packageData: PackageJson = {
                dependencies: {
                    core: "0.0.24",
                },
            };

            const packagePath = path.join(tempDir, "package.json");
            fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

            const loaded = await loadPackageJson(mockFs, path.join(tempDir, "package.json"));

            expect(loaded).to.deep.equal(packageData);
            expect(loaded.dependencies).to.have.property("core", "0.0.24");
            expect(loaded.name).to.be.undefined;
            expect(loaded.version).to.be.undefined;
            expect(loaded.description).to.be.undefined;
            expect(loaded.jacly).to.be.undefined;
            expect(loaded.registry).to.be.undefined;
        });

        it("should load package.json with empty dependencies", async () => {
            const packageData: PackageJson = {
                name: "empty-deps",
                version: "1.0.0",
                dependencies: {},
            };

            const packagePath = path.join(tempDir, "package.json");
            fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

            const loaded = await loadPackageJson(mockFs, path.join(tempDir, "package.json"));

            expect(loaded).to.deep.equal(packageData);
            expect(loaded.dependencies).to.be.an("object").that.is.empty;
        });

        it("should throw error for invalid JSON format", async () => {
            const packagePath = path.join(tempDir, "package.json");
            fs.writeFileSync(packagePath, "{ invalid json }");

            try {
                await loadPackageJson(mockFs, path.join(tempDir, "package.json"));
                expect.fail("Expected loadPackageJson to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
            }
        });

        it("should throw error for non-existent file", async () => {
            try {
                await loadPackageJson(mockFs, path.join(tempDir, "non-existent.json"));
                expect.fail("Expected loadPackageJson to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
            }
        });

        it("should throw error for invalid package name", async () => {
            const packageData = {
                name: "invalid name with spaces",
                version: "1.0.0",
                dependencies: {},
            };

            const packagePath = path.join(tempDir, "package.json");
            fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

            try {
                await loadPackageJson(mockFs, path.join(tempDir, "package.json"));
                expect.fail("Expected loadPackageJson to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
                expect((error as Error).message).to.include("Invalid package.json format");
            }
        });

        it("should throw error for name that's too long", async () => {
            const packageData = {
                name: "a".repeat(215), // exceeds 214 char limit
                version: "1.0.0",
                dependencies: {},
            };

            const packagePath = path.join(tempDir, "package.json");
            fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

            try {
                await loadPackageJson(mockFs, path.join(tempDir, "package.json"));
                expect.fail("Expected loadPackageJson to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
                expect((error as Error).message).to.include("Invalid package.json format");
            }
        });

        it("should throw error for invalid version format", async () => {
            const packageData = {
                name: "test-package",
                version: "invalid-version",
                dependencies: {},
            };

            const packagePath = path.join(tempDir, "package.json");
            fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

            try {
                await loadPackageJson(mockFs, path.join(tempDir, "package.json"));
                expect.fail("Expected loadPackageJson to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
                expect((error as Error).message).to.include("Invalid package.json format");
            }
        });

        it("should accept valid semver versions", async () => {
            const versions = [
                "1.0.0",
                "0.1.0",
                "0.0.1",
                "1.0.0-beta",
                "1.0.0-alpha.1",
                "2.0.0-rc.1",
                "1.0.0-beta.2",
            ];

            for (const version of versions) {
                const packageData: PackageJson = {
                    name: "test-package",
                    version: version,
                    dependencies: {},
                };

                const packagePath = path.join(
                    tempDir,
                    `package-${version.replace(/[^a-zA-Z0-9]/g, "-")}.json`
                );
                fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

                const loaded = await loadPackageJson(
                    mockFs,
                    path.join(tempDir, `package-${version.replace(/[^a-zA-Z0-9]/g, "-")}.json`)
                );
                expect(loaded.version).to.equal(version);
            }
        });

        it("should handle invalid dependency names in dependencies", async () => {
            const packageData = {
                name: "test-package",
                version: "1.0.0",
                dependencies: {
                    "invalid dependency name": "1.0.0",
                },
            };

            const packagePath = path.join(tempDir, "package.json");
            fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

            try {
                await loadPackageJson(mockFs, path.join(tempDir, "package.json"));
                expect.fail("Expected loadPackageJson to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
                expect((error as Error).message).to.include("Invalid package.json format");
            }
        });

        it("should handle invalid dependency versions in dependencies", async () => {
            const packageData = {
                name: "test-package",
                version: "1.0.0",
                dependencies: {
                    "valid-name": "invalid-version",
                },
            };

            const packagePath = path.join(tempDir, "package.json");
            fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

            try {
                await loadPackageJson(mockFs, path.join(tempDir, "package.json"));
                expect.fail("Expected loadPackageJson to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
                expect((error as Error).message).to.include("Invalid package.json format");
            }
        });
    });

    describe("savePackageJson()", () => {
        it("should save valid package.json with proper formatting", async () => {
            const packageData: PackageJson = {
                name: "test-package",
                version: "1.0.0",
                description: "A test package",
                dependencies: {
                    core: "0.0.24",
                    "led-strip": "1.2.3",
                },
                jacly: ["src/main.js", "lib/utils.js"],
                registry: ["https://registry.example.com"],
            };

            await savePackageJson(mockFs, path.join(tempDir, "package.json"), packageData);

            const packagePath = path.join(tempDir, "package.json");
            expect(fs.existsSync(packagePath)).to.be.true;

            const fileContent = fs.readFileSync(packagePath, "utf-8");
            const parsedData = JSON.parse(fileContent);

            expect(parsedData).to.deep.equal(packageData);

            // Check formatting (should be pretty-printed with 4 spaces)
            expect(fileContent).to.include('    "name": "test-package"');
            expect(fileContent).to.include('    "version": "1.0.0"');
        });

        it("should save minimal package.json", async () => {
            const packageData: PackageJson = {
                dependencies: {
                    core: "0.0.24",
                },
            };

            await savePackageJson(mockFs, path.join(tempDir, "package.json"), packageData);

            const packagePath = path.join(tempDir, "package.json");
            const fileContent = fs.readFileSync(packagePath, "utf-8");
            const parsedData = JSON.parse(fileContent);

            expect(parsedData).to.deep.equal(packageData);
        });

        it("should create directory if it doesn't exist", async () => {
            const nestedDir = path.join(tempDir, "nested", "directory");
            const packageData: PackageJson = {
                dependencies: {},
            };

            // Directory shouldn't exist initially
            expect(fs.existsSync(nestedDir)).to.be.false;

            await savePackageJson(mockFs, path.join(nestedDir, "package.json"), packageData);

            const packagePath = path.join(nestedDir, "package.json");
            expect(fs.existsSync(packagePath)).to.be.true;

            const parsedData = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
            expect(parsedData).to.deep.equal(packageData);
        });

        it("should overwrite existing file", async () => {
            const packagePath = path.join(tempDir, "package.json");

            // Create initial file
            const initialData: PackageJson = {
                name: "initial",
                dependencies: {},
            };
            await savePackageJson(mockFs, path.join(tempDir, "package.json"), initialData);

            // Overwrite with new data
            const newData: PackageJson = {
                name: "updated",
                version: "2.0.0",
                dependencies: {
                    core: "1.0.0",
                },
            };
            await savePackageJson(mockFs, path.join(tempDir, "package.json"), newData);

            const parsedData = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
            expect(parsedData).to.deep.equal(newData);
            expect(parsedData.name).to.equal("updated");
            expect(parsedData.version).to.equal("2.0.0");
        });

        it("should handle empty dependencies object", async () => {
            const packageData: PackageJson = {
                name: "empty-deps",
                dependencies: {},
            };

            await savePackageJson(mockFs, path.join(tempDir, "package.json"), packageData);

            const packagePath = path.join(tempDir, "package.json");
            const parsedData = JSON.parse(fs.readFileSync(packagePath, "utf-8"));

            expect(parsedData).to.deep.equal(packageData);
            expect(parsedData.dependencies).to.be.an("object").that.is.empty;
        });
    });

    describe("integration test with existing test data", () => {
        it("should load the existing test project package.json", async () => {
            const testProjectPath = path.resolve(
                path.dirname(import.meta.url.replace("file://", "")),
                projectBasePath
            );

            const loaded = await loadPackageJson(
                mockFs,
                path.join(testProjectPath, "package.json")
            );

            expect(loaded).to.have.property("dependencies");
            expect(loaded.dependencies).to.have.property("core", "0.0.24");
        });

        it("should roundtrip save and load", async () => {
            const originalData: PackageJson = {
                name: "roundtrip-test",
                version: "1.2.3",
                description: "Testing roundtrip save/load",
                dependencies: {
                    core: "0.0.24",
                    "test-lib": "2.1.0-beta",
                },
                jacly: ["src/index.js", "lib/helper.js"],
                registry: ["https://test.registry.com", "https://backup.registry.com"],
            };

            // Save the data
            await savePackageJson(mockFs, path.join(tempDir, "roundtrip.json"), originalData);

            // Load it back
            const loadedData = await loadPackageJson(mockFs, path.join(tempDir, "roundtrip.json"));

            // Should be identical
            expect(loadedData).to.deep.equal(originalData);
        });
    });

    describe("Schema validation edge cases", () => {
        it("should accept valid package names with all allowed characters", async () => {
            const validNames = [
                "core",
                "led-strip",
                "test_package",
                "package.name",
                "package123",
                "a",
                "@scope/package",
                "@org/my-package",
                "@company/test.package",
                "test~package",
                "A".repeat(214).toLowerCase(), // max length
            ];

            for (const name of validNames) {
                const packageData: PackageJson = {
                    name: name,
                    dependencies: {},
                };

                const packagePath = path.join(
                    tempDir,
                    `test-${name.replace(/[^a-zA-Z0-9]/g, "-")}.json`
                );
                fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

                const loaded = await loadPackageJson(
                    mockFs,
                    path.join(tempDir, `test-${name.replace(/[^a-zA-Z0-9]/g, "-")}.json`)
                );
                expect(loaded.name).to.equal(name);
            }
        });

        it("should reject invalid package names", async () => {
            const invalidNames = [
                "", // empty
                "name with spaces",
                "Name", // uppercase at start
                "Package123", // uppercase
                "name@symbol",
                "name#hash",
                "name$dollar",
                "@SCOPE/package", // uppercase in scope
                "@scope/Package", // uppercase in package name
                "a".repeat(215), // too long (exceeds 214)
            ];

            for (const name of invalidNames) {
                const packageData = {
                    name: name,
                    dependencies: {},
                };

                const packagePath = path.join(
                    tempDir,
                    `invalid-${Math.random().toString(36)}.json`
                );
                fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

                try {
                    await loadPackageJson(mockFs, path.join(tempDir, path.basename(packagePath)));
                    expect.fail(`Expected name "${name}" to be invalid`);
                } catch (error) {
                    expect(error).to.be.an("error");
                    expect((error as Error).message).to.include("Invalid package.json format");
                }
            }
        });

        it("should handle complex dependency structures", async () => {
            const packageData: PackageJson = {
                name: "complex-deps",
                version: "1.0.0",
                dependencies: {
                    simple: "1.0.0",
                    "beta-version": "2.0.0-beta.1",
                    "alpha-version": "3.0.0-alpha",
                    "rc-version": "4.0.0-rc.2",
                    "long-name": "5.0.0",
                    "dots.and.more": "6.0.0",
                    under_scores: "7.0.0",
                    "dash-es": "8.0.0",
                },
            };

            const packagePath = path.join(tempDir, "complex.json");
            fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));

            const loaded = await loadPackageJson(mockFs, path.join(tempDir, "complex.json"));
            expect(loaded.dependencies).to.deep.equal(packageData.dependencies);
        });
    });
});
