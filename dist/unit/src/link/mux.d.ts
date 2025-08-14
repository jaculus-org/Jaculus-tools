import { Encoder } from "./encoders/interface.js";
import { Consumer, Packet } from "./linkTypes.js";
import { Duplex } from "./stream.js";
export declare class Mux {
    private encoder;
    private _stream;
    private _channels;
    private _globalCallback?;
    private _packetizer;
    private _serializerCapacity;
    closed: boolean;
    constructor(encoder: Encoder, stream: Duplex);
    start(): void;
    private receive;
    buildPacket(channel: number): Packet;
    maxPacketSize(): number;
    subscribeChannel(channel: number, consumer?: Consumer): void;
    setGlobalCallback(callback?: (channel: number, data: Buffer) => void): void;
    onError(callback: (err: any) => void): void;
    onEnd(callback?: () => void): void;
    destroy(): Promise<void>;
}
//# sourceMappingURL=mux.d.ts.map