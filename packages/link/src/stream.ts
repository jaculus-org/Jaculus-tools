export interface OutputStream {
    put(c: number): void;
    write(buf: Uint8Array): void;

    onEnd(callback: (() => void) | undefined): void;
    onError(callback: ((err: any) => void) | undefined): void;

    destroy(): Promise<void>;
}

export interface InputStream {
    onData(callback: ((data: Uint8Array) => void) | undefined): void;
    onEnd(callback: (() => void) | undefined): void;
    onError(callback: ((err: any) => void) | undefined): void;

    destroy(): Promise<void>;
}

export interface Duplex extends OutputStream, InputStream {}
