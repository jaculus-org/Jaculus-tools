// Archive import utilities — extract TAR, TAR.GZ, and ZIP archives
// into a ProjectBundle, plus base64url decoding.

import { Archive } from "@obsidize/tar-browserify";
import pako from "pako";
import { unzipSync } from "fflate";
import { ProjectBundle } from "./project.js";
import { JaculusProjectType } from "./package.js";
import { RequestFunction } from "@jaculus/common";

// Detect if archive contains a single root folder with all files inside it.
// Returns the prefix to strip if detected, empty string otherwise.
export function detectRootPrefix(files: Record<string, Uint8Array>): string {
    const paths = Object.keys(files);
    if (paths.length === 0) return "";

    const topLevel = new Set<string>();
    for (const p of paths) {
        const firstPart = p.split("/")[0];
        topLevel.add(firstPart);
    }

    if (topLevel.size === 1) {
        const folder = Array.from(topLevel)[0];
        const allInFolder = paths.every((p) => p.startsWith(folder + "/") || p === folder);
        if (allInFolder && paths.some((p) => p.startsWith(folder + "/"))) {
            return folder + "/";
        }
    }

    return "";
}

// Detect project type from package files.
export function detectProjectType(files: Record<string, Uint8Array>): JaculusProjectType {
    const hasJaclyFiles = Object.keys(files).some((f) => f.endsWith(".jacly"));
    if (hasJaclyFiles) {
        return "jacly";
    }

    const packageJsonContent = files["package.json"];
    if (packageJsonContent) {
        try {
            const packageJson = JSON.parse(new TextDecoder().decode(packageJsonContent));
            if (packageJson.jacly?.type === "jacly") {
                return "jacly";
            }
        } catch {
            // Ignore JSON parse errors
        }
    }

    return "code";
}

function stripPrefix(p: string, prefix: string): string {
    if (prefix && p.startsWith(prefix)) {
        return p.slice(prefix.length);
    }
    return p;
}

// Strip common prefixes from file and dir paths (e.g., "package/" from archives).
export function stripRootPrefix(bundle: ProjectBundle, prefixToStrip: string): ProjectBundle {
    if (!prefixToStrip) return bundle;

    const strippedFiles: Record<string, Uint8Array> = {};
    const strippedDirs = new Set<string>();

    for (const [p, content] of Object.entries(bundle.files)) {
        const strippedPath = stripPrefix(p, prefixToStrip);
        if (strippedPath) {
            strippedFiles[strippedPath] = content;
        }
    }

    for (const dir of bundle.dirs) {
        const strippedPath = stripPrefix(dir, prefixToStrip.slice(0, -1));
        if (strippedPath && strippedPath !== "/") {
            strippedDirs.add(strippedPath);
        }
    }

    return { dirs: strippedDirs, files: strippedFiles };
}

// Extract TAR or TAR.GZ archive into a ProjectBundle.
async function extractTar(data: Uint8Array): Promise<ProjectBundle> {
    const dirs = new Set<string>();
    const files: Record<string, Uint8Array> = {};

    // Determine if the data is gzipped based on magic bytes (0x1f 0x8b)
    const isGzipped = data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
    const archiveData = isGzipped ? pako.ungzip(data) : data;

    for await (const entry of Archive.read(archiveData)) {
        const fileName = entry.fileName;

        if (entry.isDirectory()) {
            dirs.add(fileName.endsWith("/") ? fileName.slice(0, -1) : fileName);
        } else if (entry.isFile()) {
            files[fileName] = entry.content!;
        }
    }

    const prefixToStrip = detectRootPrefix(files);
    return stripRootPrefix({ dirs, files }, prefixToStrip);
}

// Extract ZIP archive into a ProjectBundle.
function extractZip(data: Uint8Array): ProjectBundle {
    const unzipped = unzipSync(data);
    const dirs = new Set<string>();
    const files: Record<string, Uint8Array> = {};

    for (const [p, content] of Object.entries(unzipped) as [string, Uint8Array][]) {
        if (p.endsWith("/") || content.length === 0) {
            const dirPath = p.endsWith("/") ? p.slice(0, -1) : p;
            if (dirPath) {
                dirs.add(dirPath);
            }
        } else {
            files[p] = content;
        }
    }

    const prefixToStrip = detectRootPrefix(files);
    return stripRootPrefix({ dirs, files }, prefixToStrip);
}

// Detect archive format (ZIP vs TAR/TAR.GZ) and extract.
export async function extractArchive(data: Uint8Array): Promise<ProjectBundle> {
    const isZip =
        data.length >= 4 &&
        data[0] === 0x50 &&
        data[1] === 0x4b &&
        (data[2] === 0x03 || data[2] === 0x05);

    if (isZip) {
        return extractZip(data);
    }

    return await extractTar(data);
}

export interface PackageLoadResult {
    projectType: JaculusProjectType;
    package: ProjectBundle;
    fileCount: number;
}

// Load package from raw binary data (ZIP or TAR.GZ).
export async function loadPackageFromBytes(data: Uint8Array): Promise<PackageLoadResult> {
    const pkg = await extractArchive(data);
    const projectType = detectProjectType(pkg.files);

    return {
        projectType,
        package: pkg,
        fileCount: Object.keys(pkg.files).length,
    };
}

// Load package from a URI using the provided request function.
export async function loadPackageFromUri(
    getRequest: RequestFunction,
    pkgUri: string
): Promise<PackageLoadResult> {
    const data = await getRequest(pkgUri, "");
    return loadPackageFromBytes(data);
}
