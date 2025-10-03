export interface Consumer {
    processPacket(data: Uint8Array): void;
}

export interface Packet {
    put(c: number): boolean;
    space(): number;
    send(): void;
}
