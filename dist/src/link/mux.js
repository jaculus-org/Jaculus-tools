import { logger } from "../util/logger.js";
class MuxPacket {
    constructor(stream, channel, serializer) {
        this._stream = stream;
        this._channel = channel;
        this._serializer = serializer;
    }
    put(c) {
        return this._serializer.put(c);
    }
    space() {
        return this._serializer.capacity() - this._serializer.size();
    }
    send() {
        this._stream.write(this._serializer.finalize(this._channel));
    }
}
export class Mux {
    constructor(encoder, stream) {
        this.closed = false;
        this._stream = stream;
        this._channels = {};
        this.encoder = encoder;
        this._packetizer = new this.encoder.packetizer();
        this._serializerCapacity = new this.encoder.serializer().capacity();
    }
    start() {
        this._stream.onData((data) => this.receive(data));
    }
    receive(data) {
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
    buildPacket(channel) {
        if (this.closed) {
            throw new Error("Mux is closed");
        }
        return new MuxPacket(this._stream, channel, new this.encoder.serializer());
    }
    maxPacketSize() {
        return this._serializerCapacity;
    }
    subscribeChannel(channel, consumer) {
        if (!consumer) {
            delete this._channels[channel];
            return;
        }
        this._channels[channel] = consumer;
    }
    setGlobalCallback(callback) {
        this._globalCallback = callback;
    }
    onError(callback) {
        this._stream.onError(callback);
    }
    onEnd(callback) {
        this._stream.onEnd(() => {
            this.closed = true;
            if (callback) {
                callback();
            }
        });
    }
    destroy() {
        return this._stream.destroy();
    }
}
//# sourceMappingURL=mux.js.map