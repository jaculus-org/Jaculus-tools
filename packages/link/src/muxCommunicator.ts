import { Packet, Consumer } from "./linkTypes.js";
import { Mux } from "./mux.js";
import {
    InputStreamCommunicator,
    InputPacketCommunicator,
    OutputStreamCommunicator,
    OutputPacketCommunicator,
} from "./communicator.js";

export class MuxOutputStreamCommunicator implements OutputStreamCommunicator {
    private mux: Mux;
    private channel: number;

    constructor(mux: Mux, channel: number) {
        this.mux = mux;
        this.channel = channel;
    }

    public put(c: number): void {
        this.write(new Uint8Array([c]));
    }

    public write(data: Uint8Array): void {
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

export class MuxInputStreamCommunicator implements InputStreamCommunicator, Consumer {
    private _onData?: (data: Uint8Array) => void;

    constructor(mux: Mux, channel: number) {
        mux.subscribeChannel(channel, this);
    }

    public processPacket(data: Uint8Array): void {
        if (this._onData) {
            this._onData(data);
        }
    }

    public onData(callback: ((data: Uint8Array) => void) | undefined): void {
        this._onData = callback;
    }
}

export class MuxOutputPacketCommunicator implements OutputPacketCommunicator {
    private mux: Mux;
    private channel: number;

    constructor(mux: Mux, channel: number) {
        this.mux = mux;
        this.channel = channel;
    }

    public buildPacket(): Packet {
        return this.mux.buildPacket(this.channel);
    }

    public maxPacketSize(): number {
        return this.mux.maxPacketSize();
    }
}

export class MuxInputPacketCommunicator implements InputPacketCommunicator, Consumer {
    private _onData?: (data: Uint8Array) => void;

    constructor(mux: Mux, channel: number) {
        mux.subscribeChannel(channel, this);
    }

    public processPacket(data: Uint8Array): void {
        if (this._onData) {
            this._onData(data);
        }
    }

    public onData(callback: ((data: Uint8Array) => void) | undefined): void {
        this._onData = callback;
    }
}
