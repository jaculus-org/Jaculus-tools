import { FSInterface, Logger } from "@jaculus/common";
import { JacDevice } from "@jaculus/device";
import { Archive, ArchiveEntry } from "@obsidize/tar-browserify";
import pako from "pako";
import path from "path";
import { Writable } from "stream";

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

export async function unpackPackage(
    fs: FSInterface,
    outPath: string,
    pkg: AsyncIterable<ArchiveEntry>,
    filter: (fileName: string) => boolean,
    dryRun: boolean = false
): Promise<void> {
    for await (const entry of pkg) {
        const source = entry.fileName;

        if (!filter(source)) {
            console.log(`Skip file: ${source}`);
            continue;
        }
        const fullPath = path.join(outPath, source);

        console.log(`${fs.existsSync(fullPath) ? "Overwrite" : "Create"} file: ${fullPath}`);
        if (!dryRun) {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            await fs.promises.writeFile(fullPath, entry.content!);
        }
    }
}

export async function createProject(
    fs: FSInterface,
    outPath: string,
    archive: AsyncIterable<ArchiveEntry>,
    dryRun: boolean = false
): Promise<void> {
    const filter = (fileName: string): boolean => {
        if (fileName === "manifest.json") {
            return false;
        }
        return true;
    };

    await unpackPackage(fs, outPath, archive, filter, dryRun);
}

export async function updateProject(
    fs: FSInterface,
    outPath: string,
    archive: AsyncIterable<ArchiveEntry>,
    dryRun: boolean = false,
    stderr: Writable
): Promise<void> {
    if (!fs.existsSync(outPath)) {
        stderr.write(`Directory '${outPath}' does not exist\n`);
        throw 1;
    }

    if (!fs.statSync(outPath).isDirectory()) {
        stderr.write(`Path '${outPath}' is not a directory\n`);
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
                stderr.write(`Invalid skeleton entry: ${JSON.stringify(entry)}\n`);
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

    await unpackPackage(fs, outPath, archive, filter, dryRun);
}
