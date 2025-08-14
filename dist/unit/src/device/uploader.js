import * as fs from "fs";
import { encodePath } from "../util/encoding.js";
import { logger } from "../util/logger.js";
import path from "path";
export var UploaderCommand;
(function (UploaderCommand) {
    UploaderCommand[UploaderCommand["READ_FILE"] = 1] = "READ_FILE";
    UploaderCommand[UploaderCommand["WRITE_FILE"] = 2] = "WRITE_FILE";
    UploaderCommand[UploaderCommand["DELETE_FILE"] = 3] = "DELETE_FILE";
    UploaderCommand[UploaderCommand["LIST_DIR"] = 4] = "LIST_DIR";
    UploaderCommand[UploaderCommand["CREATE_DIR"] = 5] = "CREATE_DIR";
    UploaderCommand[UploaderCommand["DELETE_DIR"] = 6] = "DELETE_DIR";
    UploaderCommand[UploaderCommand["FORMAT_STORAGE"] = 7] = "FORMAT_STORAGE";
    UploaderCommand[UploaderCommand["LIST_RESOURCES"] = 8] = "LIST_RESOURCES";
    UploaderCommand[UploaderCommand["READ_RESOURCE"] = 9] = "READ_RESOURCE";
    UploaderCommand[UploaderCommand["HAS_MORE_DATA"] = 16] = "HAS_MORE_DATA";
    UploaderCommand[UploaderCommand["LAST_DATA"] = 17] = "LAST_DATA";
    UploaderCommand[UploaderCommand["OK"] = 32] = "OK";
    UploaderCommand[UploaderCommand["ERROR"] = 33] = "ERROR";
    UploaderCommand[UploaderCommand["NOT_FOUND"] = 34] = "NOT_FOUND";
    UploaderCommand[UploaderCommand["CONTINUE"] = 35] = "CONTINUE";
    UploaderCommand[UploaderCommand["LOCK_NOT_OWNED"] = 36] = "LOCK_NOT_OWNED";
    UploaderCommand[UploaderCommand["GET_DIR_HASHES"] = 37] = "GET_DIR_HASHES";
})(UploaderCommand || (UploaderCommand = {}));
export const UploaderCommandStrings = {
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
export class Uploader {
    constructor(in_, out) {
        this._in = in_;
        this._out = out;
        this._in.onData((data) => {
            this.processPacket(data);
        });
    }
    waitContinue(callback) {
        return new Promise((resolve) => {
            this._onContinue = () => {
                this._onContinue = undefined;
                resolve();
            };
            callback();
        });
    }
    processPacket(data_) {
        const data = Buffer.from(data_);
        if (data.length < 1) {
            return false;
        }
        const cmd = data[0];
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
    readFile(path_) {
        logger.verbose("Reading file: " + path_);
        return new Promise((resolve, reject) => {
            let data = Buffer.alloc(0);
            this._onData = (d) => {
                const newData = Buffer.alloc(data.length + d.length);
                newData.set(data);
                newData.set(d, data.length);
                data = newData;
                return true;
            };
            this._onDataComplete = () => {
                resolve(data);
                return true;
            };
            this._onError = (cmd) => {
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
    writeFile(path_, data) {
        logger.verbose("Writing file: " + path_ + " - " + data.length);
        return new Promise((resolve, reject) => {
            this._onOk = () => {
                resolve(UploaderCommand.OK);
                return true;
            };
            this._onError = (cmd) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };
            (async () => {
                let packet = this._out.buildPacket();
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
                    }
                    else {
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
                        await this.waitContinue(() => { packet.send(); });
                    }
                    else {
                        packet.send();
                    }
                    packet = null;
                } while (offset < data.length);
            })();
        });
    }
    deleteFile(path_) {
        logger.verbose("Deleting file: " + path_);
        return new Promise((resolve, reject) => {
            this._onOk = () => {
                resolve(UploaderCommand.OK);
                return true;
            };
            this._onError = (cmd) => {
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
    listDirectory(path_, flags = "") {
        logger.verbose("Listing directory: " + path_ + " - '" + flags + "'");
        return new Promise((resolve, reject) => {
            let data = Buffer.alloc(0);
            this._onData = (d) => {
                const newData = Buffer.alloc(data.length + d.length);
                newData.set(data);
                newData.set(d, data.length);
                data = newData;
                return true;
            };
            this._onDataComplete = () => {
                const buffer = Buffer.alloc(270);
                let bufferIn = 0;
                const result = [];
                for (let i = 0; i < data.length; i++) {
                    const b = data[i];
                    if (b == 0) {
                        let name = buffer.toString("utf8", 0, buffer.indexOf(0));
                        const isDir = name.charAt(0) == "d";
                        name = name.slice(1);
                        let size = 0;
                        for (let off = 0; off < 4; off++) {
                            logger.debug("size: " + size + " + " + data[i + off + 1]);
                            size <<= 8;
                            size |= data[i + off + 1];
                        }
                        i += 4;
                        result.push([name, isDir, size]);
                        buffer.fill(0);
                        bufferIn = 0;
                    }
                    else {
                        buffer[bufferIn++] = b;
                    }
                }
                resolve(result);
                return true;
            };
            this._onError = (cmd) => {
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
    createDirectory(path_) {
        logger.verbose("Creating directory: " + path_);
        return new Promise((resolve, reject) => {
            this._onOk = () => {
                resolve(UploaderCommand.OK);
                return true;
            };
            this._onError = (cmd) => {
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
    deleteDirectory(path_) {
        logger.verbose("Deleting directory: " + path_);
        return new Promise((resolve, reject) => {
            this._onOk = () => {
                resolve(UploaderCommand.OK);
                return true;
            };
            this._onError = (cmd) => {
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
    async upload(from, to) {
        logger.info("Uploading " + from + " to " + to);
        if (fs.lstatSync(from).isDirectory()) {
            const files = fs.readdirSync(from);
            await this.createDirectory(to).catch((cmd) => {
                throw "Failed to create directory: " + UploaderCommandStrings[cmd];
            });
            for (const file of files) {
                await this.upload(path.join(from, file), to + "/" + file).catch((err) => {
                    throw err;
                });
            }
            return UploaderCommand.OK;
        }
        else {
            const data = fs.readFileSync(from);
            await this.writeFile(to, data).catch((cmd) => {
                throw "Failed to write file (" + to + "): " + UploaderCommandStrings[cmd];
            });
            return UploaderCommand.OK;
        }
    }
    async push(from, to) {
        logger.verbose("Pushing " + from + " to " + to);
        if (!fs.lstatSync(from).isDirectory()) {
            throw "Source must be a directory";
        }
        const files = fs.readdirSync(from);
        for (const file of files) {
            await this.upload(path.join(from, file), to + "/" + file).catch((err) => {
                throw err;
            });
        }
        return UploaderCommand.OK;
    }
    async pullFile(from, to) {
        logger.info("Pulling " + from + " to " + to);
        const data = await this.readFile(from).catch((cmd) => {
            throw "Failed to read file: " + UploaderCommandStrings[cmd];
        });
        fs.writeFileSync(to, data);
        return UploaderCommand.OK;
    }
    async pullDir(from, to) {
        logger.info("Pulling " + from + " to " + to);
        const files = await this.listDirectory(from).catch((cmd) => {
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
                await this.pullDir(from + "/" + name, to + "/" + name).catch((err) => {
                    throw err;
                });
            }
            else {
                await this.pullFile(from + "/" + name, to + "/" + name).catch((err) => {
                    throw err;
                });
            }
        }
        return UploaderCommand.OK;
    }
    async pull(from, to) {
        logger.verbose("Pulling " + from + " to " + to);
        const [, isDir,] = await this.listDirectory(from).catch((err) => {
            throw "Failed to get file type: " + err;
        });
        if (isDir) {
            return this.pullDir(from, to);
        }
        return this.pullFile(from, to);
    }
    formatStorage() {
        logger.verbose("Formatting storage");
        return new Promise((resolve, reject) => {
            this._onOk = () => {
                resolve(UploaderCommand.OK);
                return true;
            };
            this._onError = (cmd) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.FORMAT_STORAGE);
            packet.put(UploaderCommand.OK);
            packet.send();
        });
    }
    getDirHashes(path_) {
        logger.verbose("Getting hashes of directory: " + path_);
        return new Promise((resolve, reject) => {
            let data = Buffer.alloc(0);
            this._onData = (d) => {
                const newData = Buffer.alloc(data.length + d.length);
                newData.set(data);
                newData.set(d, data.length);
                data = newData;
                return true;
            };
            this._onDataComplete = () => {
                const buffer = Buffer.alloc(270);
                let bufferIn = 0;
                const result = [];
                for (let i = 0; i < data.length; i++) {
                    const b = data[i];
                    if (b == 0) {
                        const name = buffer.toString("utf8", 0, buffer.indexOf(0));
                        const sha1 = data.toString("hex", i + 1, i + 21);
                        i += 20;
                        logger.verbose(`${name} ${sha1}`);
                        result.push([name, sha1]);
                        buffer.fill(0);
                        bufferIn = 0;
                    }
                    else {
                        buffer[bufferIn++] = b;
                    }
                }
                resolve(result);
                return true;
            };
            this._onError = (cmd) => {
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
    listResources() {
        logger.verbose("Listing resources");
        return new Promise((resolve, reject) => {
            let data = Buffer.alloc(0);
            this._onData = (d) => {
                const newData = Buffer.alloc(data.length + d.length);
                newData.set(data);
                newData.set(d, data.length);
                data = newData;
                return true;
            };
            this._onDataComplete = () => {
                console.log(data);
                const buffer = Buffer.alloc(270);
                let bufferIn = 0;
                const result = [];
                for (let i = 0; i < data.length; i++) {
                    const b = data[i];
                    if (b == 0) {
                        const name = buffer.toString("utf8", 0, buffer.indexOf(0));
                        let size = 0;
                        for (let off = 0; off < 4; off++) {
                            logger.debug("size: " + size + " + " + data[i + off + 1]);
                            size <<= 8;
                            size |= data[i + off + 1];
                        }
                        i += 4;
                        result.push([name, size]);
                        buffer.fill(0);
                        bufferIn = 0;
                    }
                    else {
                        buffer[bufferIn++] = b;
                    }
                }
                resolve(result);
                return true;
            };
            this._onError = (cmd) => {
                reject(UploaderCommandStrings[cmd]);
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(UploaderCommand.LIST_RESOURCES);
            packet.send();
        });
    }
    readResource(name) {
        logger.verbose("Reading resource: " + name);
        return new Promise((resolve, reject) => {
            let data = Buffer.alloc(0);
            this._onData = (d) => {
                const newData = Buffer.alloc(data.length + d.length);
                newData.set(data);
                newData.set(d, data.length);
                data = newData;
                return true;
            };
            this._onDataComplete = () => {
                resolve(data);
                return true;
            };
            this._onError = (cmd) => {
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
}
//# sourceMappingURL=uploader.js.map