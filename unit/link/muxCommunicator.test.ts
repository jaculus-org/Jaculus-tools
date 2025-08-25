import * as chai from "chai";
import chaiBytes from "chai-bytes";
import { Mux } from "@jaculus/link/mux.js";
import Queue from "queue-fifo";
import { Duplex } from "@jaculus/link/stream.js";
import { Consumer } from "@jaculus/link/linkTypes.js";
import { CobsEncoder } from "@jaculus/link/encoders/cobs.js";

chai.use(chaiBytes);
const expect = chai.expect;

function rangeArray(start: number, count: number): number[] {
    return Array.from(Array(count).keys()).map((i) => i + start);
}

function toBuffer(data: Array<number | string>): Buffer {
    return Buffer.from(data.map((d) => (typeof d == "string" ? d.charCodeAt(0) : d)));
}

class Pipe implements Duplex {
    private _onData: ((data: Buffer) => void) | undefined;
    private _onSend: ((data: Buffer) => void) | undefined;

    onData(callback: ((data: Buffer) => void) | undefined): void {
        this._onData = callback;
    }

    onEnd(): void {
        /* do nothing */
    }
    onError(): void {
        /* do nothing */
    }
    destroy(): Promise<void> {
        return Promise.resolve();
    }

    onSend(callback: ((data: Buffer) => void) | undefined): void {
        this._onSend = callback;
    }

    put(c: number): void {
        this.write(Buffer.from([c]));
    }

    write(buf: Buffer): void {
        if (this._onSend) {
            this._onSend(buf);
        }
    }

    receive(buf: Buffer): void {
        if (this._onData) {
            this._onData(buf);
        }
    }
}

class BufferConsumer implements Consumer {
    public queue: Queue<Buffer> = new Queue();

    processPacket(data: Buffer): void {
        this.queue.enqueue(data);
    }
}

describe("Mux", () => {
    describe("send-receive packet", () => {
        const pipe1 = new Pipe();
        const pipe2 = new Pipe();

        pipe1.onSend((data: Buffer) => pipe2.receive(data));
        pipe2.onSend((data: Buffer) => pipe1.receive(data));

        const mux1 = new Mux(CobsEncoder, pipe1);
        const mux2 = new Mux(CobsEncoder, pipe2);

        mux1.start();
        mux2.start();

        const capacity = mux1.maxPacketSize();

        // [comment, channel, data]
        const testData: [string, number, number[]][] = [
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
                    const queue: Queue<[number, Buffer]> = new Queue();

                    mux2.setGlobalCallback((channel: number, data: Buffer) => {
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
