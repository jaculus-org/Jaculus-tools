import { InputPacketCommunicator, OutputPacketCommunicator } from "@jaculus/link/communicator";
import { Logger } from "@jaculus/common";
import { TimeoutPromise, encodePath } from "./util.js";

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
    private _logger?: Logger;

    private _onPacket?: (cmd: ControllerCommand, data: Uint8Array) => boolean;

    private cancel(): void {
        this._onPacket = undefined;
    }

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

    public processPacket(data_: Uint8Array): boolean {
        const data = data_;
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
        this._logger?.verbose("Starting program: " + path);
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
        this._logger?.verbose("Stopping program");
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
        this._logger?.verbose("Getting status");
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand, data: Uint8Array) => {
                    if (cmd == ControllerCommand.STATUS && data.length > 0) {
                        resolve({
                            running: data[0] == 1,
                            exitCode: data[1],
                            status: new TextDecoder().decode(data.slice(2)),
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
        this._logger?.verbose("Getting version");
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand, data: Uint8Array) => {
                    if (cmd == ControllerCommand.VERSION && data.length > 0) {
                        const res = [];
                        for (let row of new TextDecoder().decode(data).split("\n")) {
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
        this._logger?.verbose("Locking controller");

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
                this._logger?.verbose("Failed to lock controller, retries: " + retries);
            }

            retries--;
        }
    }

    public unlock(): Promise<void> {
        this._logger?.verbose("Unlocking controller");
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
        this._logger?.verbose("Force unlocking controller");
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
        this._logger?.verbose(`Erasing config ${namespace}/${name}`);
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
        this._logger?.verbose(`Setting config ${namespace}/${name} = ${value}`);
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
        this._logger?.verbose(`Setting config ${namespace}/${name} = ${value}`);
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

                const data = new Uint8Array(8);
                const view = new DataView(data.buffer);
                view.setUint32(0, value, true);
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
        this._logger?.verbose(`Getting config ${namespace}/${name}`);
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand, data: Uint8Array) => {
                    if (cmd == ControllerCommand.CONFIG_GET && data.length >= 2) {
                        resolve(new TextDecoder().decode(data.subarray(1)));
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
        this._logger?.verbose(`Getting config ${namespace}/${name}`);
        return new TimeoutPromise(
            TIMEOUT_MS,
            (resolve, reject) => {
                this._onPacket = (cmd: ControllerCommand, data: Uint8Array) => {
                    if (cmd == ControllerCommand.CONFIG_GET && data.length >= 9) {
                        const view = new DataView(data.buffer, data.byteOffset + 1, 6);
                        resolve(view.getUint32(0, true));
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
