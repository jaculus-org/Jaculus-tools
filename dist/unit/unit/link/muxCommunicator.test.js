import * as chai from "chai";
import chaiBytes from "chai-bytes";
import { Mux } from "../../src/link/mux.js";
import Queue from "queue-fifo";
import { CobsEncoder } from "../../src/link/encoders/cobs.js";
chai.use(chaiBytes);
const expect = chai.expect;
function rangeArray(start, count) {
    return Array.from(Array(count).keys()).map(i => i + start);
}
function toBuffer(data) {
    return Buffer.from(data.map(d => typeof d == "string" ? d.charCodeAt(0) : d));
}
class Pipe {
    onData(callback) {
        this._onData = callback;
    }
    onEnd() { }
    onError() { }
    destroy() { return Promise.resolve(); }
    onSend(callback) {
        this._onSend = callback;
    }
    put(c) {
        this.write(Buffer.from([c]));
    }
    write(buf) {
        if (this._onSend) {
            this._onSend(buf);
        }
    }
    receive(buf) {
        if (this._onData) {
            this._onData(buf);
        }
    }
}
class BufferConsumer {
    constructor() {
        this.queue = new Queue();
    }
    processPacket(data) {
        this.queue.enqueue(data);
    }
}
describe("Mux", () => {
    describe("send-receive packet", () => {
        const pipe1 = new Pipe();
        const pipe2 = new Pipe();
        pipe1.onSend((data) => pipe2.receive(data));
        pipe2.onSend((data) => pipe1.receive(data));
        const mux1 = new Mux(CobsEncoder, pipe1);
        const mux2 = new Mux(CobsEncoder, pipe2);
        mux1.start();
        mux2.start();
        const capacity = mux1.maxPacketSize();
        // [comment, channel, data]
        const testData = [
            ["Empty packet", 0, []],
            ["Single byte", 1, [0x01]],
            ["Two bytes", 2, [0x01, 0x02]],
            ["Three bytes", 3, [0x01, 0x02, 0x03]],
            ["Full packet", 255, rangeArray(0, capacity)],
            ["Full packet ch1", 1, rangeArray(0, capacity)],
        ];
        describe("global callback", () => {
            testData.forEach(([comment, channel, data]) => {
                it(comment, () => {
                    const queue = new Queue();
                    mux2.setGlobalCallback((channel, data) => {
                        queue.enqueue([channel, data]);
                    });
                    const buf = toBuffer(data);
                    const packet = mux1.buildPacket(channel);
                    for (let i = 0; i < buf.length; i++) {
                        packet.put(buf[i]);
                    }
                    packet.send();
                    expect(queue.size()).to.equal(1);
                    const received = queue.dequeue();
                    if (!received) {
                        throw new Error("No packet received");
                    }
                    expect(received[0]).to.equal(channel);
                    expect(received[1]).to.equalBytes(buf);
                });
            });
        });
        describe("channel consumer", () => {
            testData.forEach(([comment, channel, data]) => {
                it(comment, () => {
                    const consumer = new BufferConsumer();
                    mux2.subscribeChannel(channel, consumer);
                    const buf = toBuffer(data);
                    const packet = mux1.buildPacket(channel);
                    for (let i = 0; i < buf.length; i++) {
                        packet.put(buf[i]);
                    }
                    packet.send();
                    expect(consumer.queue.size()).to.equal(1);
                    const received = consumer.queue.dequeue();
                    if (!received) {
                        throw new Error("No packet received");
                    }
                    expect(received).to.equalBytes(buf);
                });
            });
        });
    });
});
//# sourceMappingURL=muxCommunicator.test.js.map