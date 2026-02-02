import path from "path";
import { Archive } from "@obsidize/tar-browserify";
import pako from "pako";

export type FSPromisesInterface = typeof import("fs").promises;
export type FSInterface = typeof import("fs");

export type RequestFunction = (baseUri: string, libFile: string) => Promise<Uint8Array>;

export function getRequestJson(
    getRequest: RequestFunction,
    baseUri: string,
    libFile: string
): Promise<any> {
    return getRequest(baseUri, libFile).then((data) => {
        const text = new TextDecoder().decode(data);
        return JSON.parse(text);
    });
}

export async function copyFolder(
    fsSource: FSInterface,
    dirSource: string,
    fsDest: FSInterface,
    dirDest: string,
    copySubdirs: boolean = true
) {
    if (!fsSource.existsSync(dirSource)) {
        console.warn(`Source directory ${dirSource} does not exist, skipping copy.`);
        return;
    }

    if (!fsDest.existsSync(dirDest)) {
        fsDest.mkdirSync(dirDest, { recursive: true });
    }

    const items = fsSource.readdirSync(dirSource);
    for (const item of items) {
        const sourcePath = path.join(dirSource, item);
        const destPath = path.join(dirDest, item);
        const stats = fsSource.statSync(sourcePath);
        if (stats.isDirectory() && copySubdirs) {
            await copyFolder(fsSource, sourcePath, fsDest, destPath);
        } else if (stats.isFile()) {
            const content = fsSource.readFileSync(sourcePath, "utf-8");
            fsDest.writeFileSync(destPath, content, "utf-8");
        }
    }
}

export function recursivelyPrintFs(fs: FSInterface, dir: string, indent: string = "") {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
            console.log(`${indent}[DIR]  ${item}`);
            recursivelyPrintFs(fs, fullPath, indent + "  ");
        } else {
            console.log(`${indent}[FILE] ${item}`);
        }
    }
}

export async function extractTgz(
    packageData: Uint8Array,
    fs: FSInterface,
    extractionRoot: string
): Promise<void> {
    if (!fs.existsSync(extractionRoot)) {
        fs.mkdirSync(extractionRoot, { recursive: true });
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
                fs.mkdirSync(fullPath, { recursive: true });
            }
        } else if (entry.isFile()) {
            const dirPath = path.dirname(fullPath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            fs.writeFileSync(fullPath, entry.content!);
        }
    }
}

export async function traverseDirectory(
    fsp: FSPromisesInterface,
    dir: string,
    callback: (filePath: string, content: Uint8Array) => Promise<void>,
    filterFiles?: (filePath: string) => boolean,
    filterDirs?: (dirPath: string) => boolean
) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!filterDirs || filterDirs(fullPath)) {
                await traverseDirectory(fsp, fullPath, callback, filterFiles, filterDirs);
            }
        } else if (entry.isFile()) {
            if (!filterFiles || filterFiles(fullPath)) {
                const content = await fsp.readFile(fullPath);

                await callback(fullPath, content);
            }
        }
    }
}
