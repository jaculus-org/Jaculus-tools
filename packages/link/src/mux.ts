import { Encoder, Packetizer, Serializer } from "./encoders/interface.js";
import { Consumer, Packet } from "./linkTypes.js";
import { Duplex, OutputStream } from "./stream.js";
import { logger } from "@jaculus/util/logger.js";


class MuxPacket implements Packet {
    private _stream: OutputStream;
    private _channel: number;
    private _serializer: Serializer;

    public constructor(stream: OutputStream, channel: number, serializer: Serializer) {
        this._stream = stream;
        this._channel = channel;
        this._serializer = serializer;
    }

    public put(c: number): boolean {
        return this._serializer.put(c);
    }

    public space(): number {
        return this._serializer.capacity() - this._serializer.size();
    }

    public send(): void {
        this._stream.write(this._serializer.finalize(this._channel));
    }
}


export class Mux {
    private encoder: Encoder;

    private _stream: Duplex;

    private _channels: Record<number, Consumer>;
    private _globalCallback?: (channel: number, data: Buffer) => void;

    private _packetizer: Packetizer;
    private _serializerCapacity: number;

    public closed = false;

    public constructor(encoder: Encoder, stream: Duplex) {
        this._stream = stream;
        this._channels = {};

        this.encoder = encoder;
        this._packetizer = new this.encoder.packetizer();
        this._serializerCapacity = new this.encoder.serializer().capacity();
    }

    public start(): void {
        this._stream.onData((data: Buffer) => this.receive(data));
    }

    private receive(data: Buffer): void {
        if (this.closed) {
            throw new Error("Mux is closed");
        }
        logger.silly("receive『" + data.reduce((a, b) => a + String.fromCharCode(b), "") + "』");
        for (const c of data) {
            if (this._packetizer.put(c)) {
                const result = this._packetizer.decode();
                if (result) {
                    const consumer = this._channels[result.channel];
                    if (consumer) {
                        consumer.processPacket(Buffer.from(result.data));
                    }
                    if (this._globalCallback) {
                        this._globalCallback(result.channel, result.data);
                    }
                }
                else {
                    // XXX: handle invalid packet
                    // ignored, UART seems stable enough, errors are only caused by garbage data (after reset...)
                }
            }
        }
    }

    public buildPacket(channel: number): Packet {
        if (this.closed) {
            throw new Error("Mux is closed");
        }
        return new MuxPacket(this._stream, channel, new this.encoder.serializer());
    }

    public maxPacketSize(): number {
        return this._serializerCapacity;
    }

    public subscribeChannel(channel: number, consumer?: Consumer): void {
        if (!consumer) {
            delete this._channels[channel];
            return;
        }
        this._channels[channel] = consumer;
    }

    public setGlobalCallback(callback?: (channel: number, data: Buffer) => void) {
        this._globalCallback = callback;
    }

    public onError(callback: (err: any) => void) {
        this._stream.onError(callback);
    }

    public onEnd(callback?: () => void): void {
        this._stream.onEnd(() => {
            this.closed = true;
            if (callback) {
                callback();
            }
        });
    }

    public destroy(): Promise<void> {
        return this._stream.destroy();
    }
}
