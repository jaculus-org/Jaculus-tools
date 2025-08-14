export class MuxOutputStreamCommunicator {
    constructor(mux, channel) {
        this.mux = mux;
        this.channel = channel;
    }
    put(c) {
        this.write(Buffer.from([c]));
    }
    write(data) {
        let packet = this.mux.buildPacket(this.channel);
        for (const c of data) {
            if (packet.put(c)) {
                packet.send();
                packet = this.mux.buildPacket(this.channel);
            }
        }
        if (packet.space() < this.mux.maxPacketSize()) {
            packet.send();
        }
    }
}
export class MuxInputStreamCommunicator {
    constructor(mux, channel) {
        mux.subscribeChannel(channel, this);
    }
    processPacket(data) {
        if (this._onData) {
            this._onData(data);
        }
    }
    onData(callback) {
        this._onData = callback;
    }
}
export class MuxOutputPacketCommunicator {
    constructor(mux, channel) {
        this.mux = mux;
        this.channel = channel;
    }
    buildPacket() {
        return this.mux.buildPacket(this.channel);
    }
    maxPacketSize() {
        return this.mux.maxPacketSize();
    }
}
export class MuxInputPacketCommunicator {
    constructor(mux, channel) {
        mux.subscribeChannel(channel, this);
    }
    processPacket(data) {
        if (this._onData) {
            this._onData(data);
        }
    }
    onData(callback) {
        this._onData = callback;
    }
}
//# sourceMappingURL=muxCommunicator.js.map