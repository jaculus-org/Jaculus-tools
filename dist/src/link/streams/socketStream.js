import * as net from "net";
export class SocketStream {
    constructor(host, port, openCallbacks = {}) {
        this.callbacks = {};
        this.socket = new net.Socket();
        this.socket.setTimeout(1000);
        const openErrCbk = (err) => {
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
            this.socket.on("error", (err) => {
                if (this.callbacks["error"]) {
                    this.callbacks["error"](err);
                }
            });
        });
        // consider all errors open errors before the socket is ready
        this.socket.on("error", openErrCbk);
        this.socket.on("data", (data) => {
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
    put(c) {
        this.socket.write(Buffer.from([c]));
    }
    write(buf) {
        const bufCopy = Buffer.from(buf);
        this.socket.write(bufCopy);
    }
    onData(callback) {
        this.callbacks["data"] = callback;
    }
    onEnd(callback) {
        this.callbacks["end"] = callback;
    }
    onError(callback) {
        this.callbacks["error"] = callback;
    }
    destroy() {
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
                this.callbacks["error"] = (err) => {
                    error(err);
                    reject(err);
                };
            }
            else {
                this.callbacks["error"] = (err) => {
                    reject(err);
                };
            }
            this.socket.destroy();
        });
    }
}
//# sourceMappingURL=socketStream.js.map