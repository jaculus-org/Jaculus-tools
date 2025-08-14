import { Duplex } from "../stream.js";
export declare class SocketStream implements Duplex {
    private callbacks;
    private socket;
    constructor(host: string, port: number, openCallbacks?: {
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
//# sourceMappingURL=socketStream.d.ts.map