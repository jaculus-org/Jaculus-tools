import { Logger, FSInterface } from "@jaculus/common";
import { JacDevice } from "@jaculus/device";
import pako from "pako";
import path from "path";
import * as tar from "tar-stream";
import { extractPackageFromUri } from "./utils.js";
import { Buffer } from "buffer";

export interface Package {
    dirs: string[];
    files: Record<string, Buffer>;
}

async function loadFromDevice(device: JacDevice, logger?: Logger): Promise<Buffer> {
    await device.controller.lock().catch((err) => {
        logger?.error("Error locking device: " + err);
        throw 1;
    });

    const data = await device.uploader.readResource("ts-examples").catch((err) => {
        logger?.error("Error: " + err);
        throw 1;
    });

    await device.controller.unlock().catch((err) => {
        logger?.error("Error unlocking device: " + err);
        throw 1;
    });

    return data;
}

async function processPackageSource(extract: tar.Extract): Promise<Package> {
    const dirs: string[] = [];
    const files: Record<string, Buffer> = {};

    await new Promise((resolve, reject) => {
        extract.on(
            "entry",
            (header: tar.Headers, stream: NodeJS.ReadableStream, next: () => void) => {
                if (header.type === "directory") {
                    dirs.push(header.name);
                    next();
                    return;
                }
                if (header.type !== "file") {
                    next();
                    return;
                }

                const chunks: Buffer[] = [];
                stream.on("data", (chunk: Buffer) => {
                    chunks.push(chunk);
                });
                stream.on("end", () => {
                    const data = Buffer.concat(chunks);
                    files[path.normalize(header.name)] = data;

                    next();
                });
                stream.on("error", (err: Error) => {
                    reject(err);
                });
            }
        );
        extract.on("finish", () => {
            resolve(null);
        });
        extract.on("error", (err: Error) => {
            reject(err);
        });
    });

    return { dirs, files };
}

export async function loadPackageDevice(device: JacDevice, logger?: Logger): Promise<Package> {
    const extract = tar.extract();
    const buffer = await loadFromDevice(device, logger);
    const res = pako.ungzip(buffer);
    extract.write(Buffer.from(res));
    extract.end();
    return processPackageSource(extract);
}

export async function loadPackageUri(pkgUri: string): Promise<Package> {
    const extract = await extractPackageFromUri(pkgUri);
    return processPackageSource(extract);
}

export async function unpackPackage(
    pkg: Package,
    outPath: string,
    filter: (fileName: string) => boolean,
    dryRun: boolean = false,
    fs: FSInterface,
    logger?: Logger
): Promise<void> {
    for (const dir of pkg.dirs) {
        const source = dir;
        const fullPath = path.join(outPath, source);
        if (!dryRun) {
            try {
                await fs.promises.stat(fullPath);
                // Directory exists, skip
            } catch {
                // Directory doesn't exist, create it
                logger?.info(`Create directory: ${fullPath}`);
            }
        }
    }

    for (const [fileName, data] of Object.entries(pkg.files)) {
        const source = fileName;

        if (!filter(source)) {
            logger?.info(`Skip file: ${source}`);
            continue;
        }
        const fullPath = path.join(outPath, source);

        let fileExists = false;
        try {
            await fs.promises.stat(fullPath);
            fileExists = true;
        } catch {
            // File doesn't exist
        }

        logger?.info(`${fileExists ? "Overwrite" : "Create"} file: ${fullPath}`);
        if (!dryRun) {
            const dir = path.dirname(fullPath);
            try {
                await fs.promises.stat(dir);
            } catch {
                // Directory doesn't exist, create it
                await fs.promises.mkdir(dir, { mode: 0o777 });
            }
            await fs.promises.writeFile(fullPath, data);
        }
    }
}

export async function createProject(
    outPath: string,
    pkg: Package,
    dryRun: boolean = false,
    fs: FSInterface,
    logger?: Logger
): Promise<void> {
    try {
        await fs.promises.stat(outPath);
        logger?.error(`Directory '${outPath}' already exists`);
        throw 1;
    } catch {
        // Directory doesn't exist, which is what we want
    }

    const filter = (fileName: string): boolean => {
        if (fileName === "manifest.json") {
            return false;
        }
        return true;
    };

    await unpackPackage(pkg, outPath, filter, dryRun, fs, logger);
}

export async function updateProject(
    outPath: string,
    pkg: Package,
    dryRun: boolean = false,
    fs: FSInterface,
    logger?: Logger
): Promise<void> {
    let stats;
    try {
        stats = await fs.promises.stat(outPath);
    } catch {
        logger?.error(`Directory '${outPath}' does not exist`);
        throw 1;
    }

    if (!stats.isDirectory()) {
        logger?.error(`Path '${outPath}' is not a directory`);
        throw 1;
    }

    let manifest;
    if (pkg.files["manifest.json"]) {
        manifest = JSON.parse(pkg.files["manifest.json"].toString("utf-8"));
    }

    let skeleton: string[];
    if (!manifest || !manifest["skeletonFiles"]) {
        skeleton = ["@types/*", "tsconfig.json"];
    } else {
        const input = manifest["skeletonFiles"];
        skeleton = [];
        for (const entry of input) {
            if (typeof entry === "string") {
                skeleton.push(entry);
            } else {
                logger?.error(`Invalid skeleton entry: ${JSON.stringify(entry)}`);
                throw 1;
            }
        }
    }

    const filter = (fileName: string): boolean => {
        if (fileName === "manifest.json") {
            return false;
        }
        for (const pattern of skeleton) {
            if (path.matchesGlob(fileName, pattern)) {
                return true;
            }
        }
        return false;
    };

    await unpackPackage(pkg, outPath, filter, dryRun, fs, logger);
}
