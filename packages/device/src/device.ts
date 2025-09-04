import { Logger } from "@jaculus/util";
import { Mux } from "@jaculus/link/mux";
import { Duplex } from "@jaculus/link/stream";
import {
    MuxOutputPacketCommunicator,
    MuxInputPacketCommunicator,
    MuxOutputStreamCommunicator,
    MuxInputStreamCommunicator,
} from "@jaculus/link/muxCommunicator";
import { CobsEncoder } from "@jaculus/link/encoders/cobs";
import { Uploader } from "./uploader.js";
import { Controller } from "./controller.js";

export { Uploader, Controller };

export class JacDevice {
    private _mux: Mux;

    public programOutput: MuxInputStreamCommunicator;
    public programInput: MuxOutputStreamCommunicator;
    public programError: MuxInputStreamCommunicator;

    public errorOutput: MuxInputStreamCommunicator;
    public logOutput: MuxInputStreamCommunicator;
    public debugOutput: MuxInputStreamCommunicator;

    public controller: Controller;
    public uploader: Uploader;

    public constructor(connection: Duplex, logger?: Logger) {
        this._mux = new Mux(CobsEncoder, connection, logger);

        this.programOutput = new MuxInputStreamCommunicator(this._mux, 16);
        this.programInput = new MuxOutputStreamCommunicator(this._mux, 16);
        this.programError = new MuxInputStreamCommunicator(this._mux, 17);

        this.errorOutput = new MuxInputStreamCommunicator(this._mux, 255);
        this.logOutput = new MuxInputStreamCommunicator(this._mux, 253);
        this.debugOutput = new MuxInputStreamCommunicator(this._mux, 251);

        this.controller = new Controller(
            new MuxInputPacketCommunicator(this._mux, 0),
            new MuxOutputPacketCommunicator(this._mux, 0),
            logger
        );

        this.uploader = new Uploader(
            new MuxInputPacketCommunicator(this._mux, 1),
            new MuxOutputPacketCommunicator(this._mux, 1),
            logger
        );

        this._mux.start();
    }

    public onError(callback: (err: any) => void): void {
        this._mux.onError(callback);
    }

    public onEnd(callback: () => void): void {
        this._mux.onEnd(callback);
    }

    public destroy(): Promise<void> {
        this.controller.unlock();
        return this._mux.destroy();
    }
}
