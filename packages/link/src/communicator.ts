import { Packet } from "./linkTypes.js";

export interface OutputStreamCommunicator {
    put(c: number): void;
    write(data: Uint8Array): void;
}

export interface InputStreamCommunicator {
    onData(callback: (data: Uint8Array) => void): void;
}

export interface OutputPacketCommunicator {
    buildPacket(): Packet;
    maxPacketSize(): number;
}

export interface InputPacketCommunicator {
    onData(callback: (data: Uint8Array) => void): void;
}
