import { Duplex } from "../link/stream.js";
import { MuxOutputStreamCommunicator, MuxInputStreamCommunicator } from "../link/muxCommunicator.js";
import { Uploader } from "./uploader.js";
import { Controller } from "./controller.js";
export declare class JacDevice {
    private _mux;
    programOutput: MuxInputStreamCommunicator;
    programInput: MuxOutputStreamCommunicator;
    programError: MuxInputStreamCommunicator;
    errorOutput: MuxInputStreamCommunicator;
    logOutput: MuxInputStreamCommunicator;
    debugOutput: MuxInputStreamCommunicator;
    controller: Controller;
    uploader: Uploader;
    constructor(connection: Duplex);
    onError(callback: (err: any) => void): void;
    onEnd(callback: () => void): void;
    destroy(): Promise<void>;
}
//# sourceMappingURL=jacDevice.d.ts.map