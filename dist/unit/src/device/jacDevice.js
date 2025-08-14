import { Mux } from "../link/mux.js";
import { MuxOutputPacketCommunicator, MuxInputPacketCommunicator, MuxOutputStreamCommunicator, MuxInputStreamCommunicator } from "../link/muxCommunicator.js";
import { Uploader } from "./uploader.js";
import { Controller } from "./controller.js";
import { CobsEncoder } from "../link/encoders/cobs.js";
export class JacDevice {
    constructor(connection) {
        this._mux = new Mux(CobsEncoder, connection);
        this.programOutput = new MuxInputStreamCommunicator(this._mux, 16);
        this.programInput = new MuxOutputStreamCommunicator(this._mux, 16);
        this.programError = new MuxInputStreamCommunicator(this._mux, 17);
        this.errorOutput = new MuxInputStreamCommunicator(this._mux, 255);
        this.logOutput = new MuxInputStreamCommunicator(this._mux, 253);
        this.debugOutput = new MuxInputStreamCommunicator(this._mux, 251);
        this.controller = new Controller(new MuxInputPacketCommunicator(this._mux, 0), new MuxOutputPacketCommunicator(this._mux, 0));
        this.uploader = new Uploader(new MuxInputPacketCommunicator(this._mux, 1), new MuxOutputPacketCommunicator(this._mux, 1));
        this._mux.start();
    }
    onError(callback) {
        this._mux.onError(callback);
    }
    onEnd(callback) {
        this._mux.onEnd(callback);
    }
    destroy() {
        this.controller.unlock();
        return this._mux.destroy();
    }
}
//# sourceMappingURL=jacDevice.js.map