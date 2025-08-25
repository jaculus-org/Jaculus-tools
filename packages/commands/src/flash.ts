import * as fs from "fs";
import crypto from "crypto";

import { Command, Env, Opt } from "./lib/command.js";
import { stderr } from "process";
import { getDevice } from "./util.js";
import { logger } from "@jaculus/util/logger.js";
import { Uploader } from "@jaculus/device/uploader.js";

enum SyncAction {
    Noop,
    Delete,
    Upload,
}

interface RemoteFileInfo {
    sha1: string;
    action: SyncAction;
}

async function fileSha1(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hasher = crypto.createHash("sha1");

        const stream = fs.createReadStream(path);
        stream.on("data", (data: Buffer | string) => {
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

async function uploadIfDifferent(
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

                await uploader.upload(src_path, dest_path);
                ++countUploaded;
                break;
            }
        }
    }
    logger.info(`Files synced, ${countUploaded} uploaded, ${countDeleted} deleted`);
}

const cmd = new Command("Flash code to device (replace contents of ./code)", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const from = options["from"] as string;

        const device = await getDevice(port, baudrate, socket, env);

        await device.controller.lock().catch((err: unknown) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        await device.controller.stop().catch((err: unknown) => {
            logger.verbose("Error stopping device: " + err);
        });

        try {
            logger.info("Getting current data hashes");
            const dataHashes = await device.uploader.getDirHashes("code").catch((err: unknown) => {
                stderr.write("Error getting data hashes: " + err + "\n");
                throw err;
            });

            await uploadIfDifferent(device.uploader, dataHashes, from, "code");
        } catch {
            logger.info("Deleting old code");
            await device.uploader.deleteDirectory("code").catch((err: unknown) => {
                logger.verbose("Error deleting directory: " + err);
            });

            const cmd = await device.uploader.upload(from, "code").catch((err: unknown) => {
                stderr.write("Error uploading: " + err + "\n");
                throw 1;
            });
            stderr.write(cmd.toString() + "\n");
        }

        await device.controller.start("index.js").catch((err: unknown) => {
            stderr.write("Error starting program: " + err + "\n");
            throw 1;
        });

        await device.controller.unlock().catch((err: unknown) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
    },
    options: {
        from: new Opt("Directory to flash", { required: true, defaultValue: "build" }),
    },
    chainable: true,
});

export default cmd;
