import { Packet, Consumer } from "./linkTypes.js";
import { Mux } from "./mux.js";
import { InputStreamCommunicator, InputPacketCommunicator, OutputStreamCommunicator, OutputPacketCommunicator } from "./communicator.js";
export declare class MuxOutputStreamCommunicator implements OutputStreamCommunicator {
    private mux;
    private channel;
    constructor(mux: Mux, channel: number);
    put(c: number): void;
    write(data: Buffer): void;
}
export declare class MuxInputStreamCommunicator implements InputStreamCommunicator, Consumer {
    private _onData?;
    constructor(mux: Mux, channel: number);
    processPacket(data: Buffer): void;
    onData(callback: ((data: Buffer) => void) | undefined): void;
}
export declare class MuxOutputPacketCommunicator implements OutputPacketCommunicator {
    private mux;
    private channel;
    constructor(mux: Mux, channel: number);
    buildPacket(): Packet;
    maxPacketSize(): number;
}
export declare class MuxInputPacketCommunicator implements InputPacketCommunicator, Consumer {
    private _onData?;
    constructor(mux: Mux, channel: number);
    processPacket(data: Buffer): void;
    onData(callback: ((data: Buffer) => void) | undefined): void;
}
//# sourceMappingURL=muxCommunicator.d.ts.map