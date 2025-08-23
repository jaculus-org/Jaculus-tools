import { Duplex } from "../stream.js";
import * as net from "net";


export class SocketStream implements Duplex {
    private callbacks: {
        "data"?: (data: Buffer) => void,
        "error"?: (err: any) => void,
        "end"?: () => void
    } = {};

    private socket: net.Socket;

    constructor(host: string, port: number, openCallbacks: {
        "open"?: () => void,
        "error"?: (err: any) => void,
    } = {}) {
        this.socket = new net.Socket();
        this.socket.setTimeout(1000);

        const openErrCbk = (err: any) => {
            if (openCallbacks["error"]) {
                openCallbacks["error"](err);
            }
        };

        this.socket.on("ready", () => {
            if (openCallbacks["open"]) {
                openCallbacks["open"]();
            }

            // change error handler to a normal one
            this.socket.off("error", openErrCbk);
            this.socket.on("error", (err: any) => {
                if (this.callbacks["error"]) {
                    this.callbacks["error"](err);
                }
            });
        });

        // consider all errors open errors before the socket is ready
        this.socket.on("error", openErrCbk);

        this.socket.on("data", (data: Buffer) => {
            if (this.callbacks["data"]) {
                this.callbacks["data"](data);
            }
        });

        this.socket.on("close", () => {
            if (this.callbacks["end"]) {
                this.callbacks["end"]();
            }
        });

        this.socket.connect(port, host);
    }


    public put(c: number): void {
        this.socket.write(Buffer.from([c]));
    }

    public write(buf: Buffer): void {
        const bufCopy = Buffer.from(buf);
        this.socket.write(bufCopy);
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
        if (this.socket.destroyed) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            if (this.callbacks["end"]) {
                const end = this.callbacks["end"];
                this.callbacks["end"] = () => {
                    end();
                    resolve();
                };
            }
            else {
                this.callbacks["end"] = () => {
                    resolve();
                };
            }
            if (this.callbacks["error"]) {
                const error = this.callbacks["error"];
                this.callbacks["error"] = (err: any) => {
                    error(err);
                    reject(err);
                };
            }
            else {
                this.callbacks["error"] = (err: any) => {
                    reject(err);
                };
            }
            this.socket.destroy();
        });
    }
}
