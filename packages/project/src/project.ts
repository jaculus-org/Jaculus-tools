import { FSPromisesInterface, Logger } from "@jaculus/common";
import { JacDevice } from "@jaculus/device";
import { Archive, ArchiveEntry } from "@obsidize/tar-browserify";
import pako from "pako";
import path from "path";

async function loadFromDevice(device: JacDevice, logger?: Logger): Promise<Uint8Array> {
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

export async function loadPackageDevice(
    device: JacDevice,
    logger?: Logger
): Promise<AsyncIterable<ArchiveEntry>> {
    const buffer = await loadFromDevice(device, logger);
    const res = pako.ungzip(buffer);
    return Archive.read(res);
}

export async function loadPackageUri(
    pkgUri: string,
    fsp?: FSPromisesInterface
): Promise<AsyncIterable<ArchiveEntry>> {
    let gz: Uint8Array;
    if (pkgUri.startsWith("http://") || pkgUri.startsWith("https://")) {
        const res = await fetch(pkgUri);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${pkgUri}`);
        gz = new Uint8Array(await res.arrayBuffer());
    } else if (pkgUri.startsWith("file://") && fsp) {
        const filePath = pkgUri.slice(7);
        gz = await fsp.readFile(filePath);
    } else {
        throw new Error(`Unsupported URI scheme or missing fs for ${pkgUri}`);
    }

    const res = pako.ungzip(gz);
    return Archive.read(res);
}

export async function unpackPackage(
    fsp: FSPromisesInterface,
    outPath: string,
    pkg: AsyncIterable<ArchiveEntry>,
    filter: (fileName: string) => boolean,
    dryRun: boolean = false,
    logger?: Logger
): Promise<void> {
    for await (const entry of pkg) {
        const source = entry.fileName;

        if (!filter(source)) {
            logger?.info(`Skip file: ${source}`);
            continue;
        }
        const fullPath = path.join(outPath, source);

        let fileExists = false;
        try {
            await fsp.stat(fullPath);
            fileExists = true;
        } catch {
            // File doesn't exist
        }

        logger?.info(`${fileExists ? "Overwrite" : "Create"} file: ${fullPath}`);
        if (!dryRun) {
            const dir = path.dirname(fullPath);
            try {
                await fsp.stat(dir);
            } catch {
                // Directory doesn't exist, create it
                await fsp.mkdir(dir, { mode: 0o777 });
            }
            await fsp.writeFile(fullPath, entry.content!);
        }
    }
}

export async function createProject(
    fsp: FSPromisesInterface,
    outPath: string,
    archive: AsyncIterable<ArchiveEntry>,
    dryRun: boolean = false,
    logger?: Logger
): Promise<void> {
    const filter = (fileName: string): boolean => {
        if (fileName === "manifest.json") {
            return false;
        }
        return true;
    };

    await unpackPackage(fsp, outPath, archive, filter, dryRun, logger);
}

export async function updateProject(
    fsp: FSPromisesInterface,
    outPath: string,
    archive: AsyncIterable<ArchiveEntry>,
    dryRun: boolean = false,
    logger?: Logger
): Promise<void> {
    let stats;
    try {
        stats = await fsp.stat(outPath);
    } catch {
        logger?.error(`Directory '${outPath}' does not exist`);
        throw 1;
    }

    if (!stats.isDirectory()) {
        logger?.error(`Path '${outPath}' is not a directory`);
        throw 1;
    }

    let manifest;
    for await (const entry of archive) {
        if (entry.fileName === "manifest.json") {
            manifest = JSON.parse(entry.content!.toString());
            break;
        }
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

    await unpackPackage(fsp, outPath, archive, filter, dryRun, logger);
}
