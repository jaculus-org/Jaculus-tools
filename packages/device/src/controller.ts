import { InputPacketCommunicator, OutputPacketCommunicator } from "@jaculus/link/communicator.js";
import { logger } from "@jaculus/util/logger.js";
import { TimeoutPromise } from "@jaculus/util/timeoutPromise.js";
import { encodePath } from "@jaculus/util/encoding.js";

const TIMEOUT_MS = 5000;
const LOCK_TIMEOUT = 100;
const LOCK_RETRIES = 50;

export enum ControllerCommand {
    START = 0x01,
    STOP = 0x02,
    STATUS = 0x03,
    VERSION = 0x04,
    LOCK = 0x10,
    UNLOCK = 0x11,
    FORCE_UNLOCK = 0x12,
    OK = 0x20,
    ERROR = 0x21,
    LOCK_NOT_OWNED = 0x22,
    CONFIG_SET = 0x30,
    CONFIG_GET = 0x31,
    CONFIG_ERASE = 0x32,
}

export const ControllerCommandStrings: Record<ControllerCommand, string> = {
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

enum KeyValueDataType {
    INT64 = 0,
    FLOAT32 = 1,
    STRING = 2,
}

export class Controller {
    private _in: InputPacketCommunicator;
    private _out: OutputPacketCommunicator;

    private _onPacket?: (cmd: ControllerCommand, data: Buffer) => boolean;

    private cancel(): void {
        this._onPacket = undefined;
    }

    public constructor(in_: InputPacketCommunicator, out: OutputPacketCommunicator) {
        this._in = in_;
        this._out = out;
        this._in.onData((data: Buffer) => {
            this.processPacket(data);
        });
    }

    public processPacket(data_: Buffer): boolean {
        const data = Buffer.from(data_);
        if (data.length < 1) {
            return false;
        }

        const cmd: ControllerCommand = data[0];

        if (this._onPacket) {
            return this._onPacket(cmd, data.slice(1));
        }
        return false;
    }

    public start(path: string): Promise<void> {
        logger.verbose("Starting program: " + path);
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand) => {
                    if (cmd == ControllerCommand.OK) {
                        resolve();
                    } else {
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
            },
            () => {
                this.cancel();
            }
        );
    }

    public stop(): Promise<void> {
        logger.verbose("Stopping program");
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand) => {
                    if (cmd == ControllerCommand.OK) {
                        resolve();
                    } else {
                        reject(ControllerCommandStrings[cmd]);
                    }
                    return true;
                };

                const packet = this._out.buildPacket();
                packet.put(ControllerCommand.STOP);
                packet.send();
            },
            () => {
                this.cancel();
            }
        );
    }

    public status(): Promise<{ running: boolean; exitCode?: number; status: string }> {
        logger.verbose("Getting status");
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand, data: Buffer) => {
                    if (cmd == ControllerCommand.STATUS && data.length > 0) {
                        resolve({
                            running: data[0] == 1,
                            exitCode: data[1],
                            status: data.slice(2).toString("utf8"),
                        });
                    } else {
                        reject(ControllerCommandStrings[cmd]);
                    }
                    return true;
                };

                const packet = this._out.buildPacket();
                packet.put(ControllerCommand.STATUS);
                packet.send();
            },
            () => {
                this.cancel();
            }
        );
    }

    public version(): Promise<string[]> {
        logger.verbose("Getting version");
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand, data: Buffer) => {
                    if (cmd == ControllerCommand.VERSION && data.length > 0) {
                        const res = [];
                        for (let row of data.toString("utf8").split("\n")) {
                            row = row.trim();
                            if (row.length > 0) {
                                res.push(row);
                            }
                        }

                        resolve(res);
                    } else {
                        reject(ControllerCommandStrings[cmd]);
                    }
                    return true;
                };

                const packet = this._out.buildPacket();
                packet.put(ControllerCommand.VERSION);
                packet.send();
            },
            () => {
                this.cancel();
            }
        );
    }

    public async lock(): Promise<void> {
        logger.verbose("Locking controller");

        let retries = LOCK_RETRIES;
        while (retries > 0) {
            try {
                await new TimeoutPromise(
                    LOCK_TIMEOUT,
                    (resolve, reject) => {
                        this._onPacket = (cmd: ControllerCommand) => {
                            if (cmd == ControllerCommand.OK) {
                                setTimeout(resolve, 10);
                            } else {
                                reject(ControllerCommandStrings[cmd]);
                            }
                            return true;
                        };

                        const packet = this._out.buildPacket();
                        packet.put(ControllerCommand.LOCK);
                        packet.send();
                    },
                    () => {
                        this.cancel();
                    }
                );

                return;
            } catch {
                logger.verbose("Failed to lock controller, retries: " + retries);
            }

            retries--;
        }
    }

    public unlock(): Promise<void> {
        logger.verbose("Unlocking controller");
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand) => {
                    if (cmd == ControllerCommand.OK) {
                        resolve();
                    } else {
                        reject(ControllerCommandStrings[cmd]);
                    }
                    return true;
                };

                const packet = this._out.buildPacket();
                packet.put(ControllerCommand.UNLOCK);
                packet.send();
            },
            () => {
                this.cancel();
            }
        );
    }

    public forceUnlock(): Promise<void> {
        logger.verbose("Force unlocking controller");
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand) => {
                    if (cmd == ControllerCommand.OK) {
                        resolve();
                    } else {
                        reject(ControllerCommandStrings[cmd]);
                    }
                    return true;
                };

                const packet = this._out.buildPacket();
                packet.put(ControllerCommand.FORCE_UNLOCK);
                packet.send();
            },
            () => {
                this.cancel();
            }
        );
    }

    public configErase(namespace: string, name: string): Promise<void> {
        logger.verbose(`Erasing config ${namespace}/${name}`);
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand) => {
                    if (cmd == ControllerCommand.OK) {
                        resolve();
                    } else {
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
            },
            () => {
                this.cancel();
            }
        );
    }

    public configSetString(namespace: string, name: string, value: string): Promise<void> {
        logger.verbose(`Setting config ${namespace}/${name} = ${value}`);
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand) => {
                    if (cmd == ControllerCommand.OK) {
                        resolve();
                    } else {
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
            },
            () => {
                this.cancel();
            }
        );
    }

    public configSetInt(namespace: string, name: string, value: number): Promise<void> {
        logger.verbose(`Setting config ${namespace}/${name} = ${value}`);
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand) => {
                    if (cmd == ControllerCommand.OK) {
                        resolve();
                    } else {
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
            },
            () => {
                this.cancel();
            }
        );
    }

    public configGetString(namespace: string, name: string): Promise<string> {
        logger.verbose(`Getting config ${namespace}/${name}`);
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand, data: Buffer) => {
                    if (cmd == ControllerCommand.CONFIG_GET && data.length >= 2) {
                        resolve(data.subarray(1).toString("utf-8"));
                    } else {
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
            },
            () => {
                this.cancel();
            }
        );
    }

    public configGetInt(namespace: string, name: string): Promise<number> {
        logger.verbose(`Getting config ${namespace}/${name}`);
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand, data: Buffer) => {
                    if (cmd == ControllerCommand.CONFIG_GET && data.length >= 9) {
                        resolve(data.readUintLE(1, 6));
                    } else {
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
            },
            () => {
                this.cancel();
            }
        );
    }
}
