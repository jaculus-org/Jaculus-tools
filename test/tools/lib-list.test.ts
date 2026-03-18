import libList from "../../packages/tools/src/commands/lib-list.js";
import path from "path";
import { pathToFileURL } from "url";
import {
    cleanupTestDir,
    createProjectStructure,
    createTestDir,
    expect,
    generateTestRegistryPackages,
} from "../project/testHelpers.js";

describe("lib-list command", () => {
    before(async () => {
        await generateTestRegistryPackages("data/test-registry/");
    });

    it("should include transitive dependencies with --resolved", async () => {
        const tempDir = createTestDir("jaculus-lib-list-test-");
        const projectPath = createProjectStructure(tempDir, "test-project", {
            dependencies: {
                "led-strip": "0.0.5",
            },
            registry: [pathToFileURL(path.resolve("test/project/data/test-registry/")).toString()],
        });

        const originalWrite = process.stdout.write;
        const originalCwd = process.cwd();
        const output: string[] = [];

        process.stdout.write = ((chunk: string | Uint8Array) => {
            output.push(chunk.toString());
            return true;
        }) as typeof process.stdout.write;

        try {
            process.chdir(projectPath);
            await libList.run(["--resolved"], {}, {});
        } finally {
            process.chdir(originalCwd);
            process.stdout.write = originalWrite;
            cleanupTestDir(tempDir);
        }

        expect(output.join("")).to.equal("color@0.0.2\nled-strip@0.0.5\n");
    });
});
