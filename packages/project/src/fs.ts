import path from "path";
import { Archive } from "@obsidize/tar-browserify";
import pako from "pako";
import { Logger } from "@jaculus/common";

export type FSPromisesInterface = typeof import("fs").promises;
export type FSInterface = typeof import("fs");

export async function copyFolder(
    fsSource: FSInterface,
    dirSource: string,
    fsDest: FSInterface,
    dirDest: string,
    copySubdirs: boolean = true,
    logger?: Logger
) {
    if (!fsSource.existsSync(dirSource)) {
        throw new Error(`Source directory does not exist: ${dirSource}`);
    }

    if (!fsDest.existsSync(dirDest)) {
        await fsDest.promises.mkdir(dirDest, { recursive: true });
    }

    const items = fsSource.readdirSync(dirSource);
    for (const item of items) {
        const sourcePath = path.join(dirSource, item);
        const destPath = path.join(dirDest, item);
        const stats = fsSource.statSync(sourcePath);
        if (stats.isDirectory() && copySubdirs) {
            await copyFolder(fsSource, sourcePath, fsDest, destPath, copySubdirs, logger);
        } else if (stats.isFile()) {
            const content = fsSource.readFileSync(sourcePath, "utf-8");
            await fsDest.promises.writeFile(destPath, content, "utf-8");
        }
    }
}

export async function extractTgzPackage(
    packageData: Uint8Array,
    fs: FSInterface,
    extractionRoot: string
): Promise<void> {
    const fsp = fs.promises;
    if (!fs.existsSync(extractionRoot)) {
        await fsp.mkdir(extractionRoot, { recursive: true });
    }

    for await (const entry of Archive.read(pako.ungzip(packageData))) {
        // archive entries are prefixed with "package/" -> skip that part
        if (!entry.fileName.startsWith("package/")) {
            continue;
        }
        const relativePath = entry.fileName.substring("package/".length);
        if (!relativePath) {
            continue;
        }

        const fullPath = path.join(extractionRoot, relativePath);

        if (entry.isDirectory()) {
            if (!fs.existsSync(fullPath)) {
                await fsp.mkdir(fullPath, { recursive: true });
            }
        } else if (entry.isFile()) {
            const dirPath = path.dirname(fullPath);
            if (!fs.existsSync(dirPath)) {
                await fsp.mkdir(dirPath, { recursive: true });
            }
            await fsp.writeFile(fullPath, entry.content!);
        }
    }
}

export async function traverseDirectory(
    fsp: FSPromisesInterface,
    dir: string,
    fileCallback: (filePath: string, content: Uint8Array) => Promise<void>,
    filterFiles?: (filePath: string) => boolean,
    filterDirs?: (dirPath: string) => boolean
) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!filterDirs || filterDirs(fullPath)) {
                await traverseDirectory(fsp, fullPath, fileCallback, filterFiles, filterDirs);
            }
        } else if (entry.isFile()) {
            if (!filterFiles || filterFiles(fullPath)) {
                const content = await fsp.readFile(fullPath);
                await fileCallback(fullPath, content);
            }
        }
    }
}
