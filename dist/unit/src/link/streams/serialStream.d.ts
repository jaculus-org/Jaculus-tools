import { Duplex } from "../stream.js";
export declare class SerialStream implements Duplex {
    private path;
    private baudRate;
    private callbacks;
    private port;
    constructor(path: string, baudRate: number, openCallbacks?: {
        "open"?: () => void;
        "error"?: (err: any) => void;
    });
    put(c: number): void;
    write(buf: Buffer): void;
    onData(callback?: (data: Buffer) => void): void;
    onEnd(callback?: () => void): void;
    onError(callback?: (err: any) => void): void;
    destroy(): Promise<void>;
}
//# sourceMappingURL=serialStream.d.ts.map