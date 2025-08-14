import { Packet } from "./linkTypes.js";
export interface OutputStreamCommunicator {
    put(c: number): void;
    write(data: Buffer): void;
}
export interface InputStreamCommunicator {
    onData(callback: (data: Buffer) => void): void;
}
export interface OutputPacketCommunicator {
    buildPacket(): Packet;
    maxPacketSize(): number;
}
export interface InputPacketCommunicator {
    onData(callback: (data: Buffer) => void): void;
}
//# sourceMappingURL=communicator.d.ts.map