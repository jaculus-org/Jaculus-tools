import * as chai from "chai";
import chaiBytes from "chai-bytes";
import Queue from "queue-fifo";
import { Mux } from "@jaculus/link/mux";
import { Duplex } from "@jaculus/link/stream";
import { Consumer } from "@jaculus/link/linkTypes";
import { CobsEncoder } from "@jaculus/link/encoders/cobs";
import { rangeArray, toBuffer } from "./util.js";

chai.use(chaiBytes);
const expect = chai.expect;

class Pipe implements Duplex {
    private _onData: ((data: Uint8Array) => void) | undefined;
    private _onSend: ((data: Uint8Array) => void) | undefined;

    onData(callback: ((data: Uint8Array) => void) | undefined): void {
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

    onSend(callback: ((data: Uint8Array) => void) | undefined): void {
        this._onSend = callback;
    }

    put(c: number): void {
        this.write(new Uint8Array([c]));
    }

    write(buf: Uint8Array): void {
        if (this._onSend) {
            this._onSend(buf);
        }
    }

    receive(buf: Uint8Array): void {
        if (this._onData) {
            this._onData(buf);
        }
    }
}

class BufferConsumer implements Consumer {
    public queue: Queue<Uint8Array> = new Queue();

    processPacket(data: Uint8Array): void {
        this.queue.enqueue(data);
    }
}

describe("Mux", () => {
    describe("send-receive packet", () => {
        const pipe1 = new Pipe();
        const pipe2 = new Pipe();

        pipe1.onSend((data: Uint8Array) => pipe2.receive(data));
        pipe2.onSend((data: Uint8Array) => pipe1.receive(data));

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
                    const queue: Queue<[number, Uint8Array]> = new Queue();

                    mux2.setGlobalCallback((channel: number, data: Uint8Array) => {
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
