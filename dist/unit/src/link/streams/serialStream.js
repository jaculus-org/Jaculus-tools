import { SerialPort } from "serialport";
export class SerialStream {
    constructor(path, baudRate, openCallbacks = {}) {
        this.callbacks = {};
        this.path = path;
        this.baudRate = baudRate;
        this.port = new SerialPort({
            path: this.path,
            baudRate: this.baudRate
        }, (err) => {
            if (err) {
                if (openCallbacks["error"]) {
                    openCallbacks["error"](err);
                }
                return;
            }
            this.port.set({
                rts: false,
                dtr: false
            });
            setTimeout(() => {
                this.port.set({
                    rts: true,
                    dtr: true
                });
                if (openCallbacks["open"]) {
                    openCallbacks["open"]();
                }
            }, 10);
        });
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
    put(c) {
        this.port.write(c);
    }
    write(buf) {
        const bufCopy = Buffer.from(buf);
        this.port.write(bufCopy);
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
                }
                else {
                    if (this.callbacks["end"]) {
                        this.callbacks["end"]();
                    }
                    resolve();
                }
            });
        });
    }
}
//# sourceMappingURL=serialStream.js.map