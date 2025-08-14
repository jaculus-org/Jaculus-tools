import { logger } from "../util/logger.js";
import { TimeoutPromise } from "../util/timeoutPromise.js";
import { encodePath } from "../util/encoding.js";
const TIMEOUT_MS = 5000;
const LOCK_TIMEOUT = 100;
const LOCK_RETRIES = 50;
export var ControllerCommand;
(function (ControllerCommand) {
    ControllerCommand[ControllerCommand["START"] = 1] = "START";
    ControllerCommand[ControllerCommand["STOP"] = 2] = "STOP";
    ControllerCommand[ControllerCommand["STATUS"] = 3] = "STATUS";
    ControllerCommand[ControllerCommand["VERSION"] = 4] = "VERSION";
    ControllerCommand[ControllerCommand["LOCK"] = 16] = "LOCK";
    ControllerCommand[ControllerCommand["UNLOCK"] = 17] = "UNLOCK";
    ControllerCommand[ControllerCommand["FORCE_UNLOCK"] = 18] = "FORCE_UNLOCK";
    ControllerCommand[ControllerCommand["OK"] = 32] = "OK";
    ControllerCommand[ControllerCommand["ERROR"] = 33] = "ERROR";
    ControllerCommand[ControllerCommand["LOCK_NOT_OWNED"] = 34] = "LOCK_NOT_OWNED";
    ControllerCommand[ControllerCommand["CONFIG_SET"] = 48] = "CONFIG_SET";
    ControllerCommand[ControllerCommand["CONFIG_GET"] = 49] = "CONFIG_GET";
    ControllerCommand[ControllerCommand["CONFIG_ERASE"] = 50] = "CONFIG_ERASE";
})(ControllerCommand || (ControllerCommand = {}));
export const ControllerCommandStrings = {
    [ControllerCommand.START]: "START",
    [ControllerCommand.STOP]: "STOP",
    [ControllerCommand.STATUS]: "STATUS",
    [ControllerCommand.VERSION]: "VERSION",
    [ControllerCommand.LOCK]: "LOCK",
    [ControllerCommand.UNLOCK]: "UNLOCK",
    [ControllerCommand.FORCE_UNLOCK]: "FORCE_UNLOCK",
    [ControllerCommand.OK]: "OK",
    [ControllerCommand.ERROR]: "ERROR",
    [ControllerCommand.LOCK_NOT_OWNED]: "LOCK_NOT_OWNED",
    [ControllerCommand.CONFIG_SET]: "CONFIG_SET",
    [ControllerCommand.CONFIG_GET]: "CONFIG_GET",
    [ControllerCommand.CONFIG_ERASE]: "CONFIG_ERASE",
};
var KeyValueDataType;
(function (KeyValueDataType) {
    KeyValueDataType[KeyValueDataType["INT64"] = 0] = "INT64";
    KeyValueDataType[KeyValueDataType["FLOAT32"] = 1] = "FLOAT32";
    KeyValueDataType[KeyValueDataType["STRING"] = 2] = "STRING";
})(KeyValueDataType || (KeyValueDataType = {}));
export class Controller {
    cancel() {
        this._onPacket = undefined;
    }
    constructor(in_, out) {
        this._in = in_;
        this._out = out;
        this._in.onData((data) => {
            this.processPacket(data);
        });
    }
    processPacket(data_) {
        const data = Buffer.from(data_);
        if (data.length < 1) {
            return false;
        }
        const cmd = data[0];
        if (this._onPacket) {
            return this._onPacket(cmd, data.slice(1));
        }
        return false;
    }
    start(path) {
        logger.verbose("Starting program: " + path);
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd) => {
                if (cmd == ControllerCommand.OK) {
                    resolve();
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.START);
            for (const c of path) {
                packet.put(c.charCodeAt(0));
            }
            packet.send();
        }, () => {
            this.cancel();
        });
    }
    stop() {
        logger.verbose("Stopping program");
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd) => {
                if (cmd == ControllerCommand.OK) {
                    resolve();
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.STOP);
            packet.send();
        }, () => {
            this.cancel();
        });
    }
    status() {
        logger.verbose("Getting status");
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd, data) => {
                if (cmd == ControllerCommand.STATUS && data.length > 0) {
                    resolve({
                        running: data[0] == 1,
                        exitCode: data[1],
                        status: data.slice(2).toString("utf8"),
                    });
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.STATUS);
            packet.send();
        }, () => {
            this.cancel();
        });
    }
    version() {
        logger.verbose("Getting version");
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd, data) => {
                if (cmd == ControllerCommand.VERSION && data.length > 0) {
                    const res = [];
                    for (let row of data.toString("utf8").split("\n")) {
                        row = row.trim();
                        if (row.length > 0) {
                            res.push(row);
                        }
                    }
                    resolve(res);
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.VERSION);
            packet.send();
        }, () => {
            this.cancel();
        });
    }
    async lock() {
        logger.verbose("Locking controller");
        let retries = LOCK_RETRIES;
        while (retries > 0) {
            try {
                await new TimeoutPromise(LOCK_TIMEOUT, (resolve, reject) => {
                    this._onPacket = (cmd) => {
                        if (cmd == ControllerCommand.OK) {
                            setTimeout(resolve, 10);
                        }
                        else {
                            reject(ControllerCommandStrings[cmd]);
                        }
                        return true;
                    };
                    const packet = this._out.buildPacket();
                    packet.put(ControllerCommand.LOCK);
                    packet.send();
                }, () => {
                    this.cancel();
                });
                return;
            }
            catch {
                logger.verbose("Failed to lock controller, retries: " + retries);
            }
            retries--;
        }
    }
    unlock() {
        logger.verbose("Unlocking controller");
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd) => {
                if (cmd == ControllerCommand.OK) {
                    resolve();
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.UNLOCK);
            packet.send();
        }, () => {
            this.cancel();
        });
    }
    forceUnlock() {
        logger.verbose("Force unlocking controller");
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd) => {
                if (cmd == ControllerCommand.OK) {
                    resolve();
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.FORCE_UNLOCK);
            packet.send();
        }, () => {
            this.cancel();
        });
    }
    configErase(namespace, name) {
        logger.verbose(`Erasing config ${namespace}/${name}`);
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd) => {
                if (cmd == ControllerCommand.OK) {
                    resolve();
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.CONFIG_ERASE);
            for (const b of encodePath(namespace)) {
                packet.put(b);
            }
            for (const b of encodePath(name)) {
                packet.put(b);
            }
            packet.send();
        }, () => {
            this.cancel();
        });
    }
    configSetString(namespace, name, value) {
        logger.verbose(`Setting config ${namespace}/${name} = ${value}`);
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd) => {
                if (cmd == ControllerCommand.OK) {
                    resolve();
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.CONFIG_SET);
            for (const b of encodePath(namespace)) {
                packet.put(b);
            }
            for (const b of encodePath(name)) {
                packet.put(b);
            }
            packet.put(KeyValueDataType.STRING);
            for (const b of encodePath(value)) {
                packet.put(b);
            }
            packet.send();
        }, () => {
            this.cancel();
        });
    }
    configSetInt(namespace, name, value) {
        logger.verbose(`Setting config ${namespace}/${name} = ${value}`);
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd) => {
                if (cmd == ControllerCommand.OK) {
                    resolve();
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.CONFIG_SET);
            for (const b of encodePath(namespace)) {
                packet.put(b);
            }
            for (const b of encodePath(name)) {
                packet.put(b);
            }
            packet.put(KeyValueDataType.INT64);
            const data = Buffer.alloc(8);
            data.writeIntLE(value, 0, 6);
            for (const b of data) {
                packet.put(b);
            }
            packet.send();
        }, () => {
            this.cancel();
        });
    }
    configGetString(namespace, name) {
        logger.verbose(`Getting config ${namespace}/${name}`);
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd, data) => {
                if (cmd == ControllerCommand.CONFIG_GET && data.length >= 2) {
                    resolve(data.subarray(1).toString("utf-8"));
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.CONFIG_GET);
            for (const b of encodePath(namespace)) {
                packet.put(b);
            }
            for (const b of encodePath(name)) {
                packet.put(b);
            }
            packet.put(KeyValueDataType.STRING);
            packet.send();
        }, () => {
            this.cancel();
        });
    }
    configGetInt(namespace, name) {
        logger.verbose(`Getting config ${namespace}/${name}`);
        return new TimeoutPromise(TIMEOUT_MS, (resolve, reject) => {
            this._onPacket = (cmd, data) => {
                if (cmd == ControllerCommand.CONFIG_GET && data.length >= 9) {
                    resolve(data.readUintLE(1, 6));
                }
                else {
                    reject(ControllerCommandStrings[cmd]);
                }
                return true;
            };
            const packet = this._out.buildPacket();
            packet.put(ControllerCommand.CONFIG_GET);
            for (const b of encodePath(namespace)) {
                packet.put(b);
            }
            for (const b of encodePath(name)) {
                packet.put(b);
            }
            packet.put(KeyValueDataType.INT64);
            packet.send();
        }, () => {
            this.cancel();
        });
    }
}
//# sourceMappingURL=controller.js.map