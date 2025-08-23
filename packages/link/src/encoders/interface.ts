export interface Serializer {
    capacity(): number;
    size(): number;
    is_empty(): boolean;
    reset(): void;
    put(c: number): boolean;
    finalize(channel: number): Buffer;
}

export interface Packetizer {
    reset(): void;
    put(c: number): boolean;
    decode(): { channel: number, data: Buffer } | null;
}

export interface Encoder {
    packetizer: new () => Packetizer;
    serializer: new () => Serializer;
}
