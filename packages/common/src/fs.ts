import path from "path";

export async function copyFolder(
    fsSource: typeof import("fs"),
    dirSource: string,
    fsDest: typeof import("fs"),
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

export function recursivelyPrintFs(fs: typeof import("fs"), dir: string, indent: string = "") {
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
