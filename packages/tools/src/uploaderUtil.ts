import crypto from "crypto";
import * as fs from "fs";
import { Uploader } from "@jaculus/device";
import { UploaderCommand, UploaderCommandStrings } from "@jaculus/device/dist/uploader.js";
import { logger } from "./logger.js";
import path from "path";
import { stderr } from "process";

enum SyncAction {
    Noop,
    Delete,
    Upload,
}

interface RemoteFileInfo {
    sha1: string;
    action: SyncAction;
}

export async function fileSha1(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hasher = crypto.createHash("sha1");

        const stream = fs.createReadStream(path);
        stream.on("data", (data: Uint8Array | string) => {
            hasher.update(data);
        });
        stream.on("error", (err: NodeJS.ErrnoException) => {
            stream.close();
            reject(err);
        });
        stream.on("end", () => {
            resolve(hasher.digest("hex"));
            stream.close();
        });
    });
}

export async function upload(
    uploader: Uploader,
    from: string,
    to: string
): Promise<UploaderCommand> {
    logger.info("Uploading " + from + " to " + to);
    if (fs.lstatSync(from).isDirectory()) {
        const files = fs.readdirSync(from);

        await uploader.createDirectory(to).catch((cmd: UploaderCommand) => {
            throw "Failed to create directory: " + UploaderCommandStrings[cmd];
        });
        for (const file of files) {
            await upload(uploader, path.join(from, file), to + "/" + file).catch((err) => {
                throw err;
            });
        }
        return UploaderCommand.OK;
    } else {
        const data = fs.readFileSync(from);

        await uploader.writeFile(to, data).catch((cmd: UploaderCommand) => {
            throw "Failed to write file (" + to + "): " + UploaderCommandStrings[cmd];
        });
        return UploaderCommand.OK;
    }
}

export async function push(uploader: Uploader, from: string, to: string): Promise<UploaderCommand> {
    logger.verbose("Pushing " + from + " to " + to);
    if (!fs.lstatSync(from).isDirectory()) {
        throw "Source must be a directory";
    }

    const files = fs.readdirSync(from);
    for (const file of files) {
        await upload(uploader, path.join(from, file), to + "/" + file).catch((err) => {
            throw err;
        });
    }
    return UploaderCommand.OK;
}

export async function pullFile(
    uploader: Uploader,
    from: string,
    to: string
): Promise<UploaderCommand> {
    logger.info("Pulling " + from + " to " + to);

    const data = await uploader.readFile(from).catch((cmd: UploaderCommand) => {
        throw "Failed to read file: " + UploaderCommandStrings[cmd];
    });

    fs.writeFileSync(to, data);

    return UploaderCommand.OK;
}

export async function pullDir(
    uploader: Uploader,
    from: string,
    to: string
): Promise<UploaderCommand> {
    logger.info("Pulling " + from + " to " + to);

    const files = await uploader.listDirectory(from).catch((cmd: UploaderCommand) => {
        throw "Failed to list directory: " + UploaderCommandStrings[cmd];
    });

    if (!fs.existsSync(to)) {
        fs.mkdirSync(to);
    }
    if (!fs.lstatSync(to).isDirectory()) {
        throw "Destination must be a directory";
    }
    if (fs.readdirSync(to).length > 0) {
        throw "Destination directory is not empty";
    }

    for (const file of files) {
        const name = file[0];
        const isDir = file[1];
        if (isDir) {
            await pullDir(uploader, from + "/" + name, to + "/" + name).catch((err) => {
                throw err;
            });
        } else {
            await pullFile(uploader, from + "/" + name, to + "/" + name).catch((err) => {
                throw err;
            });
        }
    }
    return UploaderCommand.OK;
}

export async function pull(uploader: Uploader, from: string, to: string): Promise<UploaderCommand> {
    logger.verbose("Pulling " + from + " to " + to);

    const [, isDir] = await uploader.listDirectory(from).catch((err) => {
        throw "Failed to get file type: " + err;
    });

    if (isDir) {
        return pullDir(uploader, from, to);
    }

    return pullFile(uploader, from, to);
}

export async function uploadIfDifferent(
    uploader: Uploader,
    remoteHashes: [string, string][],
    from: string,
    to: string
) {
    if (!fs.lstatSync(from).isDirectory()) {
        stderr.write("FROM must be a directory\n");
        throw 1;
    }

    const filesInfo: Record<string, RemoteFileInfo> = Object.fromEntries(
        remoteHashes.map(([name, sha1]) => {
            return [
                name,
                {
                    sha1: sha1,
                    action: SyncAction.Delete,
                },
            ];
        })
    );

    const dirs: string[] = [from];
    while (dirs.length > 0) {
        const cur_dir = dirs.pop() as string;
        const rel_cur_dir = cur_dir.substring(from.length + 1);

        const entries = fs.readdirSync(cur_dir, { withFileTypes: true });
        for (const e of entries) {
            if (e.isFile()) {
                const key = rel_cur_dir ? `${rel_cur_dir}/${e.name}` : e.name;
                const sha1 = await fileSha1(`${cur_dir}/${e.name}`);
                const info = filesInfo[key];
                if (info === undefined) {
                    filesInfo[key] = {
                        sha1: sha1,
                        action: SyncAction.Upload,
                    };
                    logger.verbose(`${key} is new, will upload`);
                } else if (info.sha1 === sha1) {
                    info.action = SyncAction.Noop;
                    logger.verbose(`${key} has same sha1 on device and on disk, skipping`);
                } else {
                    info.action = SyncAction.Upload;
                    logger.verbose(`${key} is different, will upload`);
                }
            } else if (e.isDirectory()) {
                dirs.push(`${cur_dir}/${e.name}`);
            }
        }
    }

    const existingFolders = new Set<string>();
    let countUploaded = 0;
    let countDeleted = 0;

    for (const [rel_path, info] of Object.entries(filesInfo)) {
        const src_path = `${from}/${rel_path}`;
        const dest_path = `${to}/${rel_path}`;
        switch (info.action) {
            case SyncAction.Noop:
                break;
            case SyncAction.Delete:
                try {
                    await uploader.deleteFile(dest_path);
                } catch (err) {
                    logger.verbose(`Error deleting file ${dest_path}: ${err}`);
                }
                ++countDeleted;
                break;
            case SyncAction.Upload: {
                const parts = dest_path.split("/");
                let cur_dir_part = "";
                for (const p of parts.slice(0, parts.length - 1)) {
                    if (p === "") {
                        continue;
                    }
                    const abs_p = cur_dir_part + p;
                    if (!existingFolders.has(abs_p)) {
                        await uploader.createDirectory(abs_p).catch((err: unknown) => {
                            logger.error("Error creating directory: " + err);
                        });
                        existingFolders.add(abs_p);
                    }
                    cur_dir_part += `${p}/`;
                }

                await upload(uploader, src_path, dest_path);
                ++countUploaded;
                break;
            }
        }
    }
    logger.info(`Files synced, ${countUploaded} uploaded, ${countDeleted} deleted`);
}
