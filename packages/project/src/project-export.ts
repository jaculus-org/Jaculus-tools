// Archive export utilities — pack project files into TAR.GZ or ZIP archives,
// plus base64url encoding.

import { Archive } from "@obsidize/tar-browserify";
import pako from "pako";
import { zipSync } from "fflate";
import { FSInterface } from "./fs.js";

// Encode binary data to a base64url string (RFC 4648 §5, no padding).
export function encodeBase64Url(data: Uint8Array): string {
    const binStr = Array.from(data, (byte) => String.fromCharCode(byte)).join("");
    return btoa(binStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Recursively collect all files from a directory.
export async function collectFiles(
    fs: FSInterface,
    dirPath: string,
    basePath: string = "",
    excludeDirs: string[] = []
): Promise<Record<string, Uint8Array>> {
    const files: Record<string, Uint8Array> = {};
    const items = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
        const fullPath = `${dirPath}/${item.name}`;
        const relativePath = basePath ? `${basePath}/${item.name}` : item.name;

        if (item.isDirectory()) {
            if (excludeDirs.includes(item.name)) continue;
            const subFiles = await collectFiles(fs, fullPath, relativePath, excludeDirs);
            Object.assign(files, subFiles);
        } else if (item.isFile()) {
            const content = await fs.promises.readFile(fullPath);
            files[relativePath] = content instanceof Uint8Array ? content : new Uint8Array(content);
        }
    }

    return files;
}

// Pack project files into a gzipped tar archive (returns raw bytes).
export async function packProjectAsTarGz(
    fs: FSInterface,
    projectPath: string,
    excludeDirs: string[] = []
): Promise<Uint8Array> {
    const files = await collectFiles(fs, projectPath, "", excludeDirs);

    const archive = new Archive();
    for (const [filePath, content] of Object.entries(files)) {
        archive.addBinaryFile(filePath, content);
    }

    const tarBytes = archive.toUint8Array();
    return pako.gzip(tarBytes);
}

// Pack project files into a ZIP archive (returns raw bytes).
export async function packProjectAsZip(
    fs: FSInterface,
    projectPath: string,
    excludeDirs: string[] = []
): Promise<Uint8Array> {
    const files = await collectFiles(fs, projectPath, "", excludeDirs);
    return zipSync(files, { level: 6 });
}
