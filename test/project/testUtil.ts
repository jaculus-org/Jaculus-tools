import fs from "fs";
import path from "path";

export async function createTarGzPackage(sourceDir: string, outFile: string): Promise<void> {
    const { Archive } = await import("@obsidize/tar-browserify");
    const pako = await import("pako");
    const archive = new Archive();

    // Recursively add files from sourceDir with "package/" prefix
    function addFilesToArchive(dir: string, baseDir: string = dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, fullPath);
            const tarPath = path.join("package", relativePath);

            if (entry.isDirectory()) {
                archive.addDirectory(tarPath);
                addFilesToArchive(fullPath, baseDir);
            } else if (entry.isFile()) {
                const content = fs.readFileSync(fullPath);
                archive.addBinaryFile(tarPath, content);
            }
        }
    }

    addFilesToArchive(sourceDir);

    const tarData = archive.toUint8Array();
    const gzData = pako.gzip(tarData);
    fs.writeFileSync(outFile, gzData);
}

export async function generateTestRegistryPackages(registryBasePath: string): Promise<void> {
    // Remove file:// prefix if present
    const baseDir = registryBasePath.replace(/^file:\/\//, "");
    const testDataPath = path.resolve(
        path.dirname(import.meta.url.replace("file://", "")),
        baseDir
    );
    const libraries = JSON.parse(fs.readFileSync(path.join(testDataPath, "list.json"), "utf-8"));

    for (const lib of libraries) {
        const libPath = path.join(testDataPath, lib.id);
        const versionsFile = path.join(libPath, "versions.json");

        if (fs.existsSync(versionsFile)) {
            const versions = JSON.parse(fs.readFileSync(versionsFile, "utf-8"));

            for (const ver of versions) {
                const versionPath = path.join(libPath, ver.version);
                const packagePath = path.join(versionPath, "package");
                const tarGzPath = path.join(versionPath, "package.tar.gz");

                if (fs.existsSync(packagePath)) {
                    await createTarGzPackage(packagePath, tarGzPath);
                }
            }
        }
    }
}
