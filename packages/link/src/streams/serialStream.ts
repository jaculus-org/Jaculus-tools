import { SerialPort } from "serialport";
import { Duplex } from "../stream.js";

export class SerialStream implements Duplex {
    private path: string;
    private baudRate: number;
    private callbacks: {
        data?: (data: Buffer) => void;
        error?: (err: any) => void;
        end?: () => void;
    } = {};
    private port: SerialPort;

    constructor(
        path: string,
        baudRate: number,
        openCallbacks: {
            open?: () => void;
            error?: (err: any) => void;
        } = {}
    ) {
        this.path = path;
        this.baudRate = baudRate;

        this.port = new SerialPort(
            {
                path: this.path,
                baudRate: this.baudRate,
            },
            (err) => {
                if (err) {
                    if (openCallbacks["error"]) {
                        openCallbacks["error"](err);
                    }
                    return;
                }

                this.port.set({
                    rts: false,
                    dtr: false,
                });

                setTimeout(() => {
                    this.port.set({
                        rts: true,
                        dtr: true,
                    });

                    if (openCallbacks["open"]) {
                        openCallbacks["open"]();
                    }
                }, 10);
            }
        );
        this.port.on("data", (data) => {
            if (this.callbacks["data"]) {
                this.callbacks["data"](data);
            }
        });

        this.port.on("error", (err) => {
            if (this.callbacks["error"]) {
                this.callbacks["error"](err);
            }
        });

        this.port.on("close", () => {
            if (this.callbacks["end"]) {
                this.callbacks["end"]();
            }
        });
    }

    public put(c: number): void {
        this.port.write(c);
    }

    public write(buf: Buffer): void {
        const bufCopy = Buffer.from(buf);
        this.port.write(bufCopy);
    }

    public onData(callback?: (data: Buffer) => void): void {
        this.callbacks["data"] = callback;
    }

    public onEnd(callback?: () => void): void {
        this.callbacks["end"] = callback;
    }

    public onError(callback?: (err: any) => void): void {
        this.callbacks["error"] = callback;
    }

    public destroy(): Promise<void> {
        if (this.port.closing || this.port.closed) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            this.port.close((err) => {
                if (err) {
                    if (this.callbacks["error"]) {
                        this.callbacks["error"](err);
                    }
                    if (this.callbacks["end"]) {
                        this.callbacks["end"]();
                    }
                    reject(err);
                } else {
                    if (this.callbacks["end"]) {
                        this.callbacks["end"]();
                    }
                    resolve();
                }
            });
        });
    }
}
