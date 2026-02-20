import { extractTgzPackage } from "@jaculus/project/fs";
import { Registry } from "@jaculus/project/registry";
import {
    createGetRequest,
    createFailingGetRequest,
    cleanupTestDir,
    createTestDir,
    expect,
    fs,
    registryBasePath,
    generateTestRegistryPackages,
} from "./testHelpers.js";

describe("Registry", () => {
    before(async () => {
        await generateTestRegistryPackages(registryBasePath);
    });

    describe("listPackages()", () => {
        it("should list all libraries from registry", async () => {
            const getRequest = createGetRequest();
            const registry = await Registry.create([registryBasePath], getRequest);
            const libraries = await registry.listPackages();
            expect(libraries)
                .to.be.an("array")
                .that.includes("core")
                .and.includes("led-strip")
                .and.includes("color");
        });

        it("should handle multiple registries", async () => {
            const getRequest = createGetRequest();
            const registry = Registry.createWithoutValidation([registryBasePath], getRequest);
            const libraries = await registry.listPackages();
            expect(libraries).to.be.an("array");
            expect(libraries.length).to.be.greaterThan(0);
        });

        it("should throw error when registry is unreachable", async () => {
            const getRequestFailure = createFailingGetRequest();
            const registry = Registry.createWithoutValidation(
                [registryBasePath],
                getRequestFailure
            );
            try {
                await registry.listPackages();
                expect.fail("Expected registry.listPackages() to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
            }
        });

        it("should deduplicate library IDs across registries", async () => {
            const getRequest = createGetRequest();
            const mockGetRequest = async (baseUri: string, libFile: string) => {
                if (libFile === "list.json") {
                    return new TextEncoder().encode(JSON.stringify([{ id: "duplicate-lib" }]));
                }
                return getRequest(baseUri, libFile);
            };

            const registry = Registry.createWithoutValidation(
                [registryBasePath, "another-registry"],
                mockGetRequest
            );
            const libraries = await registry.listPackages();
            expect(libraries.filter((id) => id === "duplicate-lib")).to.have.lengthOf(1);
        });
    });

    describe("exists()", () => {
        it("should return true for existing library", async () => {
            const getRequest = createGetRequest();
            const registry = Registry.createWithoutValidation([registryBasePath], getRequest);
            const exists = await registry.exists("core");
            expect(exists).to.be.true;
        });

        it("should return false for non-existing library", async () => {
            const getRequest = createGetRequest();
            const registry = Registry.createWithoutValidation([registryBasePath], getRequest);
            const exists = await registry.exists("non-existent-library");
            expect(exists).to.be.false;
        });

        it("should return false when registry is unreachable", async () => {
            const getRequestFailure = createFailingGetRequest();
            const registry = Registry.createWithoutValidation(
                [registryBasePath],
                getRequestFailure
            );
            const exists = await registry.exists("core");
            expect(exists).to.be.false;
        });
    });

    describe("listVersions()", () => {
        it("should list all versions for a library", async () => {
            const getRequest = createGetRequest();
            const registry = Registry.createWithoutValidation([registryBasePath], getRequest);
            const versions = await registry.listVersions("color");
            expect(versions).to.be.an("array").that.includes("0.0.1").and.includes("0.0.2");
        });

        it("should throw error for non-existing library", async () => {
            const getRequest = createGetRequest();
            const registry = Registry.createWithoutValidation([registryBasePath], getRequest);
            try {
                await registry.listVersions("non-existent-library");
                expect.fail("Expected registry.listVersions() to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
            }
        });

        it("should throw error when registry is unreachable", async () => {
            const getRequestFailure = createFailingGetRequest();
            const registry = Registry.createWithoutValidation(
                [registryBasePath],
                getRequestFailure
            );
            try {
                await registry.listVersions("color");
                expect.fail("Expected registry.listVersions() to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
            }
        });
    });

    describe("getPackageJson()", () => {
        it("should get package.json for a specific library version", async () => {
            const getRequest = createGetRequest();
            const registry = Registry.createWithoutValidation([registryBasePath], getRequest);
            const packageJson = await registry.getPackageJson("core", "0.0.24");
            expect(packageJson).to.be.an("object");
            expect(packageJson).to.have.property("name");
            expect(packageJson).to.have.property("version");
        });

        it("should throw error for non-existing library version", async () => {
            const getRequest = createGetRequest();
            const registry = Registry.createWithoutValidation([registryBasePath], getRequest);
            try {
                await registry.getPackageJson("non-existent-library", "1.0.0");
                expect.fail("Expected registry.getPackageJson() to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
            }
        });

        it("should throw error when registry is unreachable", async () => {
            const getRequestFailure = createFailingGetRequest();
            const registry = Registry.createWithoutValidation(
                [registryBasePath],
                getRequestFailure
            );
            try {
                await registry.getPackageJson("core", "0.0.24");
                expect.fail("Expected registry.getPackageJson() to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
            }
        });
    });

    describe("getPackageTgz()", () => {
        it("should get package tarball for a specific library version", async () => {
            const getRequest = createGetRequest();
            const registry = Registry.createWithoutValidation([registryBasePath], getRequest);
            const packageData = await registry.getPackageTgz("core", "0.0.24");
            expect(packageData).to.be.instanceOf(Uint8Array);
            expect(packageData.length).to.be.greaterThan(0);

            // check for gzip magic number
            expect(packageData[0]).to.equal(0x1f);
            expect(packageData[1]).to.equal(0x8b);
        });

        it("should throw error for non-existing library version", async () => {
            const getRequest = createGetRequest();
            const registry = Registry.createWithoutValidation([registryBasePath], getRequest);
            try {
                await registry.getPackageTgz("non-existent-library", "1.0.0");
                expect.fail("Expected registry.getPackageTgz() to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
            }
        });

        it("should throw error when registry is unreachable", async () => {
            const getRequestFailure = createFailingGetRequest();
            const registry = Registry.createWithoutValidation(
                [registryBasePath],
                getRequestFailure
            );
            try {
                await registry.getPackageTgz("core", "0.0.24");
                expect.fail("Expected registry.getPackageTgz() to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
            }
        });
    });

    describe("extractTgzPackage()", () => {
        it("should extract library package to specified directory", async () => {
            const tempDir = createTestDir("jaculus-test-");

            try {
                const getRequest = createGetRequest();
                const registry = Registry.createWithoutValidation([registryBasePath], getRequest);

                for (const library of await registry.listPackages()) {
                    for (const version of await registry.listVersions(library)) {
                        const packageData = await registry.getPackageTgz(library, version);
                        const extractDir = `${tempDir}/${library}-${version}`;
                        await extractTgzPackage(packageData, fs, extractDir);
                    }
                }
            } finally {
                cleanupTestDir(tempDir);
            }
        });

        it("should create extraction directory if it doesn't exist", async () => {
            const tempDir = createTestDir("jaculus-test-");

            try {
                const getRequest = createGetRequest();
                const registry = Registry.createWithoutValidation([registryBasePath], getRequest);
                const packageData = await registry.getPackageTgz("core", "0.0.24");
                const extractDir = `${tempDir}/nested/directory`;

                await extractTgzPackage(packageData, fs, extractDir);
            } finally {
                cleanupTestDir(tempDir);
            }
        });

        it("should handle corrupt package data gracefully", async () => {
            const tempDir = createTestDir("jaculus-test-");

            try {
                const corruptData = new Uint8Array([1, 2, 3, 4, 5]); // invalid gzip data
                const extractDir = `${tempDir}/corrupt-test`;

                try {
                    await extractTgzPackage(corruptData, fs, extractDir);
                    expect.fail("Expected extractTgzPackage to throw an error for corrupt data");
                } catch (error) {
                    expect(error).to.exist;
                }
            } finally {
                cleanupTestDir(tempDir);
            }
        });
    });

    describe("multiple registries fallback", () => {
        it("should try multiple registries and succeed with the working one", async () => {
            const workingRegistry = registryBasePath;
            const failingRegistry = "non-existent-registry";
            const getRequest = createGetRequest();

            // mix working and failing registries
            const registry = Registry.createWithoutValidation(
                [failingRegistry, workingRegistry],
                async (baseUri, libFile) => {
                    if (baseUri === failingRegistry) {
                        throw new Error("Registry not found");
                    }
                    return getRequest(baseUri, libFile);
                }
            );

            const exists = await registry.exists("core");
            expect(exists).to.be.true;
        });

        it("should fail when all registries are unreachable", async () => {
            const getRequestFailure = createFailingGetRequest();
            const registry = Registry.createWithoutValidation(
                ["registry1", "registry2"],
                getRequestFailure
            );

            try {
                await registry.listPackages();
                expect.fail("Expected registry.listPackages() to throw an error");
            } catch (error) {
                expect(error).to.be.an("error");
            }
        });
    });
});
