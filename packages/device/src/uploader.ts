import { InputPacketCommunicator, OutputPacketCommunicator } from "@jaculus/link/communicator";
import { Packet } from "@jaculus/link/linkTypes";
import { Logger, type ProjectBundle } from "@jaculus/common";
import { encodePath } from "./util.js";
import crypto from "crypto";

export enum UploaderCommand {
    READ_FILE = 0x01,
    WRITE_FILE = 0x02,
    DELETE_FILE = 0x03,
    LIST_DIR = 0x04,
    CREATE_DIR = 0x05,
    DELETE_DIR = 0x06,
    FORMAT_STORAGE = 0x07,
    LIST_RESOURCES = 0x08,
    READ_RESOURCE = 0x09,
    HAS_MORE_DATA = 0x10,
    LAST_DATA = 0x11,
    OK = 0x20,
    ERROR = 0x21,
    NOT_FOUND = 0x22,
    CONTINUE = 0x23,
    LOCK_NOT_OWNED = 0x24,
    GET_DIR_HASHES = 0x25,
}

export const UploaderCommandStrings: Record<UploaderCommand, string> = {
    [UploaderCommand.READ_FILE]: "READ_FILE",
    [UploaderCommand.WRITE_FILE]: "WRITE_FILE",
    [UploaderCommand.DELETE_FILE]: "DELETE_FILE",
    [UploaderCommand.LIST_DIR]: "LIST_DIR",
    [UploaderCommand.CREATE_DIR]: "CREATE_DIR",
    [UploaderCommand.DELETE_DIR]: "DELETE_DIR",
    [UploaderCommand.FORMAT_STORAGE]: "FORMAT_STORAGE",
    [UploaderCommand.LIST_RESOURCES]: "LIST_RESOURCES",
    [UploaderCommand.READ_RESOURCE]: "READ_RESOURCE",
    [UploaderCommand.HAS_MORE_DATA]: "HAS_MORE_DATA",
    [UploaderCommand.LAST_DATA]: "LAST_DATA",
    [UploaderCommand.OK]: "OK",
    [UploaderCommand.ERROR]: "ERROR",
    [UploaderCommand.NOT_FOUND]: "NOT_FOUND",
    [UploaderCommand.CONTINUE]: "CONTINUE",
    [UploaderCommand.LOCK_NOT_OWNED]: "LOCK_NOT_OWNED",
    [UploaderCommand.GET_DIR_HASHES]: "GET_DIR_HASHES",
};

enum SyncAction {
    Noop,
    Delete,
    Upload,
}

interface RemoteFileInfo {
    sha1: string;
    action: SyncAction;
}

export interface UploaderProgress {
    phase: "getDirHashes" | "uploadIfDifferent";
    current: number;
    total?: number;
    filePath?: string;
    action?: "delete" | "upload" | "create-dir";
}

export type UploaderProgressCallback = (progress: UploaderProgress) => void;

export class Uploader {
    private _in: InputPacketCommunicator;
    private _out: OutputPacketCommunicator;
    private _logger?: Logger;

    private _onData?: (data: Uint8Array) => boolean;
    private _onDataComplete?: () => boolean;
    private _onOk?: () => boolean;
    private _onError?: (cmd: UploaderCommand) => boolean;
    private _onContinue?: () => void;

    public constructor(
        in_: InputPacketCommunicator,
        out: OutputPacketCommunicator,
        logger?: Logger
    ) {
        this._in = in_;
        this._out = out;
        this._logger = logger;
        this._in.onData((data: Uint8Array) => {
            this.processPacket(data);
        });
    }

    waitContinue(callback: () => void): Promise<void> {
        return new Promise((resolve) => {
            this._onContinue = () => {
                this._onContinue = undefined;
                resolve();
            };
            callback();
        });
    }

    private processPacket(data_: Uint8Array): boolean {
        const data = data_;
        if (data.length < 1) {
            return false;
        }

        const cmd: UploaderCommand = data[0];

        switch (cmd) {
            case UploaderCommand.HAS_MORE_DATA:
                if (this._onData) {
                    const success = this._onData(data.slice(1));
                    if (!success) {
                        this._onData = undefined;
                        this._onDataComplete = undefined;
                        return false;
                    }
                }
                return true;
            case UploaderCommand.LAST_DATA:
                if (this._onData) {
                    let success = this._onData(data.slice(1));
                    if (!success) {
                        this._onData = undefined;
                        this._onDataComplete = undefined;
                        return false;
                    }
                    if (this._onDataComplete) {
                        success = this._onDataComplete();
                    }
                    this._onData = undefined;
                    this._onDataComplete = undefined;
                    return success;
                }
                return true;
            case UploaderCommand.OK:
                if (this._onOk) {
                    const success = this._onOk();
                    this._onOk = undefined;
                    return success;
                }
                return true;
            case UploaderCommand.CONTINUE:
                if (this._onContinue) {
                    this._onContinue();
                }
                return true;
            case UploaderCommand.ERROR:
            case UploaderCommand.NOT_FOUND:
            case UploaderCommand.LOCK_NOT_OWNED:
                if (this._onError) {
                    const success = this._onError(cmd);
                    this._onError = undefined;
                    return success;
                }
                return true;
            default:
                if (this._onError) {
                    const success = this._onError(cmd);
                    this._onError = undefined;
                    return success;
                }
                return false;
        }
    }

    public readFile(path_: string): Promise<Uint8Array> {
        this._logger?.verbose("Reading file: " + path_);
        return new Promise((resolve, reject) => {
            let data: Uint8Array = new Uint8Array(0);
            this._onData = (d: Uint8Array) => {
                const newData = new Uint8Array(data.length + d.length);
                newData.set(data);
                newData.set(d, data.length);
                data = newData;
                return true;
            };
            this._onDataComplete = () => {
                resolve(data);
                return true;
            };
            this._onError = (cmd: UploaderCommand) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.READ_FILE);
            for (const b of encodePath(path_, false)) {
                packet.put(b);
            }
            packet.send();
        });
    }

    public writeFile(path_: string, data: Uint8Array): Promise<UploaderCommand> {
        this._logger?.verbose("Writing file: " + path_ + " - " + data.length);
        return new Promise((resolve, reject) => {
            this._onOk = () => {
                resolve(UploaderCommand.OK);
                return true;
            };

            this._onError = (cmd: UploaderCommand) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };

            (async () => {
                let packet: Packet | null = this._out.buildPacket();
                packet.put(UploaderCommand.WRITE_FILE);
                for (const b of encodePath(path_, true)) {
                    packet.put(b);
                }

                let offset = 0;
                let prefix = UploaderCommand.HAS_MORE_DATA;
                let last = false;
                do {
                    let chunkSize = Math.min(data.length - offset, this._out.maxPacketSize() - 1);
                    if (packet != null) {
                        chunkSize = Math.min(chunkSize, packet.space() - 1);
                    } else {
                        packet = this._out.buildPacket();
                    }

                    if (offset + chunkSize >= data.length) {
                        last = true;
                        prefix = UploaderCommand.LAST_DATA;
                    }

                    packet.put(prefix);
                    for (let i = 0; i < chunkSize; i++, offset++) {
                        packet.put(data[offset]);
                    }

                    if (!last) {
                        await this.waitContinue(() => {
                            (packet as Packet).send();
                        });
                    } else {
                        packet.send();
                    }
                    packet = null;
                } while (offset < data.length);
            })();
        });
    }

    public deleteFile(path_: string): Promise<UploaderCommand> {
        this._logger?.verbose("Deleting file: " + path_);
        return new Promise((resolve, reject) => {
            this._onOk = () => {
                resolve(UploaderCommand.OK);
                return true;
            };

            this._onError = (cmd: UploaderCommand) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };

            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.DELETE_FILE);
            for (const b of encodePath(path_, false)) {
                packet.put(b);
            }
            packet.send();
        });
    }

    public listDirectory(path_: string, flags = ""): Promise<[string, boolean, number][]> {
        this._logger?.verbose("Listing directory: " + path_ + " - '" + flags + "'");
        return new Promise((resolve, reject) => {
            let data: Uint8Array = new Uint8Array(0);
            this._onData = (d: Uint8Array) => {
                const newData = new Uint8Array(data.length + d.length);
                newData.set(data);
                newData.set(d, data.length);
                data = newData;
                return true;
            };
            this._onDataComplete = () => {
                const buffer = new Uint8Array(270);
                let bufferIn = 0;
                const result: [string, boolean, number][] = [];
                for (let i = 0; i < data.length; i++) {
                    const b = data[i];
                    if (b == 0) {
                        let name = new TextDecoder().decode(buffer.subarray(0, buffer.indexOf(0)));
                        const isDir = name.charAt(0) == "d";
                        name = name.slice(1);
                        let size = 0;
                        for (let off = 0; off < 4; off++) {
                            this._logger?.debug("size: " + size + " + " + data[i + off + 1]);
                            size <<= 8;
                            size |= data[i + off + 1];
                        }
                        i += 4;
                        result.push([name, isDir, size]);
                        buffer.fill(0);
                        bufferIn = 0;
                    } else {
                        buffer[bufferIn++] = b;
                    }
                }
                resolve(result);
                return true;
            };
            this._onError = (cmd: UploaderCommand) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.LIST_DIR);
            for (const b of encodePath(path_, true)) {
                packet.put(b);
            }
            for (const b of flags) {
                packet.put(b.charCodeAt(0));
            }
            packet.send();
        });
    }

    public createDirectory(path_: string): Promise<UploaderCommand> {
        this._logger?.verbose("Creating directory: " + path_);
        return new Promise((resolve, reject) => {
            this._onOk = () => {
                resolve(UploaderCommand.OK);
                return true;
            };

            this._onError = (cmd: UploaderCommand) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };

            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.CREATE_DIR);
            for (const b of encodePath(path_, false)) {
                packet.put(b);
            }
            packet.send();
        });
    }

    public deleteDirectory(path_: string): Promise<UploaderCommand> {
        this._logger?.verbose("Deleting directory: " + path_);
        return new Promise((resolve, reject) => {
            this._onOk = () => {
                resolve(UploaderCommand.OK);
                return true;
            };

            this._onError = (cmd: UploaderCommand) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };

            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.DELETE_DIR);
            for (const b of encodePath(path_, false)) {
                packet.put(b);
            }
            packet.send();
        });
    }

    public formatStorage(): Promise<UploaderCommand> {
        this._logger?.verbose("Formatting storage");
        return new Promise((resolve, reject) => {
            this._onOk = () => {
                resolve(UploaderCommand.OK);
                return true;
            };

            this._onError = (cmd: UploaderCommand) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };

            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.FORMAT_STORAGE);
            packet.put(UploaderCommand.OK);
            packet.send();
        });
    }

    public getDirHashes(
        path_: string,
        onProgress?: UploaderProgressCallback
    ): Promise<[string, string][]> {
        this._logger?.verbose("Getting hashes of directory: " + path_);
        return new Promise((resolve, reject) => {
            let data: Uint8Array = new Uint8Array(0);
            this._onData = (d: Uint8Array) => {
                const newData = new Uint8Array(data.length + d.length);
                newData.set(data);
                newData.set(d, data.length);
                data = newData;
                return true;
            };
            this._onDataComplete = () => {
                const buffer = new Uint8Array(270);
                let bufferIn = 0;
                const result: [string, string][] = [];
                for (let i = 0; i < data.length; i++) {
                    const b = data[i];
                    if (b == 0) {
                        const name = new TextDecoder().decode(
                            buffer.subarray(0, buffer.indexOf(0))
                        );
                        const sha1 = Array.from(data.subarray(i + 1, i + 21))
                            .map((b) => b.toString(16).padStart(2, "0"))
                            .join("");
                        i += 20;
                        this._logger?.verbose(`${name} ${sha1}`);
                        result.push([name, sha1]);
                        onProgress?.({
                            phase: "getDirHashes",
                            current: result.length,
                            filePath: name,
                        });
                        buffer.fill(0);
                        bufferIn = 0;
                    } else {
                        buffer[bufferIn++] = b;
                    }
                }
                onProgress?.({
                    phase: "getDirHashes",
                    current: result.length,
                    total: result.length,
                });
                resolve(result);
                return true;
            };
            this._onError = (cmd: UploaderCommand) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.GET_DIR_HASHES);
            for (const b of encodePath(path_, true)) {
                packet.put(b);
            }
            packet.send();
        });
    }

    public listResources(): Promise<[string, number][]> {
        this._logger?.verbose("Listing resources");
        return new Promise((resolve, reject) => {
            let data: Uint8Array = new Uint8Array(0);
            this._onData = (d: Uint8Array) => {
                const newData = new Uint8Array(data.length + d.length);
                newData.set(data);
                newData.set(d, data.length);
                data = newData;
                return true;
            };
            this._onDataComplete = () => {
                const buffer = new Uint8Array(270);
                let bufferIn = 0;
                const result: [string, number][] = [];
                for (let i = 0; i < data.length; i++) {
                    const b = data[i];
                    if (b == 0) {
                        const nullIndex = buffer.indexOf(0);
                        const name = new TextDecoder().decode(buffer.subarray(0, nullIndex));
                        let size = 0;
                        for (let off = 0; off < 4; off++) {
                            size <<= 8;
                            size |= data[i + off + 1];
                        }
                        i += 4;
                        result.push([name, size]);
                        buffer.fill(0);
                        bufferIn = 0;
                    } else {
                        buffer[bufferIn++] = b;
                    }
                }
                resolve(result);
                return true;
            };
            this._onError = (cmd: UploaderCommand) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };

            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.LIST_RESOURCES);
            packet.send();
        });
    }

    public readResource(name: string): Promise<Uint8Array> {
        this._logger?.verbose("Reading resource: " + name);
        return new Promise((resolve, reject) => {
            let data: Uint8Array = new Uint8Array(0);
            this._onData = (d: Uint8Array) => {
                const newData = new Uint8Array(data.length + d.length);
                newData.set(data);
                newData.set(d, data.length);
                data = newData;
                return true;
            };
            this._onDataComplete = () => {
                resolve(data);
                return true;
            };
            this._onError = (cmd: UploaderCommand) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };

            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.READ_RESOURCE);
            for (const b of encodePath(name, false)) {
                packet.put(b);
            }
            packet.send();
        });
    }

    public async uploadFiles(
        bundle: ProjectBundle,
        to: string,
        onProgress?: UploaderProgressCallback
    ) {
        try {
            const remoteHashes = await this.getDirHashes(to, onProgress);
            await this.uploadIfDifferent(remoteHashes, bundle.files, to, onProgress);
        } catch {
            this._logger?.info("Falling back to full upload");
            await this.deleteDirectory(to).catch((err: unknown) => {
                this._logger?.verbose("Error deleting directory: " + err);
            });

            await this.createDirectory(to).catch((err: unknown) => {
                this._logger?.verbose("Error creating directory: " + err);
            });

            const totalDirs = bundle.dirs.size;
            let created = 0;
            for (const dir of bundle.dirs) {
                onProgress?.({
                    phase: "uploadIfDifferent",
                    current: created,
                    total: totalDirs,
                    filePath: dir,
                    action: "create-dir",
                });

                await this.createDirectory(`${to}/${dir}`).catch((err: unknown) => {
                    this._logger?.verbose("Error creating directory: " + err);
                });
                created++;
            }

            const totalFiles = Object.keys(bundle.files).length;
            let uploaded = 0;
            for (const [filePath, content] of Object.entries(bundle.files)) {
                const destPath = `${to}/${filePath}`;
                onProgress?.({
                    phase: "uploadIfDifferent",
                    current: uploaded,
                    total: totalFiles,
                    filePath,
                    action: "upload",
                });
                await this.writeFile(destPath, content).catch((cmd: UploaderCommand) => {
                    throw "Failed to write file (" + destPath + "): " + UploaderCommandStrings[cmd];
                });
                uploaded++;
            }

            this._logger?.info(`Full upload complete, ${uploaded} files written`);
        }
    }

    public async uploadIfDifferent(
        remoteHashes: [string, string][],
        files: Record<string, Uint8Array>,
        to: string,
        onProgress?: UploaderProgressCallback
    ) {
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

        for (const [filePath, data] of Object.entries(files)) {
            const sha1 = crypto.createHash("sha1").update(data).digest("hex");
            const info = filesInfo[filePath];
            if (info === undefined) {
                filesInfo[filePath] = {
                    sha1: sha1,
                    action: SyncAction.Upload,
                };
                this._logger?.verbose(`${filePath} is new, will upload`);
            } else if (info.sha1 === sha1) {
                info.action = SyncAction.Noop;
                this._logger?.verbose(`${filePath} has same sha1 on device and on disk, skipping`);
            } else {
                info.action = SyncAction.Upload;
                this._logger?.verbose(`${filePath} is different, will upload`);
            }
        }

        const existingFolders = new Set<string>();
        const syncSteps = Object.values(filesInfo).filter(
            (info) => info.action !== SyncAction.Noop
        ).length;
        let countUploaded = 0;
        let countDeleted = 0;
        let completedSteps = 0;

        for (const [rel_path, info] of Object.entries(filesInfo)) {
            const dest_path = `${to}/${rel_path}`;
            switch (info.action) {
                case SyncAction.Noop:
                    break;
                case SyncAction.Delete:
                    onProgress?.({
                        phase: "uploadIfDifferent",
                        current: completedSteps,
                        total: syncSteps,
                        filePath: rel_path,
                        action: "delete",
                    });
                    try {
                        await this.deleteFile(dest_path);
                    } catch (err) {
                        this._logger?.verbose(`Error deleting file ${dest_path}: ${err}`);
                    }
                    ++countDeleted;
                    ++completedSteps;
                    onProgress?.({
                        phase: "uploadIfDifferent",
                        current: completedSteps,
                        total: syncSteps,
                        filePath: rel_path,
                        action: "delete",
                    });
                    break;
                case SyncAction.Upload: {
                    onProgress?.({
                        phase: "uploadIfDifferent",
                        current: completedSteps,
                        total: syncSteps,
                        filePath: rel_path,
                        action: "upload",
                    });
                    const parts = dest_path.split("/");
                    let cur_dir_part = "";
                    for (const p of parts.slice(0, parts.length - 1)) {
                        if (p === "") {
                            continue;
                        }
                        const abs_p = cur_dir_part + p;
                        if (!existingFolders.has(abs_p)) {
                            await this.createDirectory(abs_p).catch((err: unknown) => {
                                this._logger?.error("Error creating directory: " + err);
                            });
                            existingFolders.add(abs_p);
                        }
                        cur_dir_part += `${p}/`;
                    }

                    const data = files[rel_path];
                    await this.writeFile(dest_path, data).catch((cmd: UploaderCommand) => {
                        throw (
                            "Failed to write file (" +
                            dest_path +
                            "): " +
                            UploaderCommandStrings[cmd]
                        );
                    });

                    ++countUploaded;
                    ++completedSteps;
                    onProgress?.({
                        phase: "uploadIfDifferent",
                        current: completedSteps,
                        total: syncSteps,
                        filePath: rel_path,
                        action: "upload",
                    });
                    break;
                }
            }
        }

        this._logger?.info(`Files synced, ${countUploaded} uploaded, ${countDeleted} deleted`);
    }
}
