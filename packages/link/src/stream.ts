export interface OutputStream {
    put(c: number): void
    write(buf: Buffer): void

    onEnd(callback: (() => void) | undefined): void
    onError(callback: ((err: any) => void) | undefined): void

    destroy(): Promise<void>
}


export interface InputStream {
    onData(callback: ((data: Buffer) => void) | undefined): void
    onEnd(callback: (() => void) | undefined): void
    onError(callback: ((err: any) => void) | undefined): void

    destroy(): Promise<void>
}


export interface Duplex extends OutputStream, InputStream {}
