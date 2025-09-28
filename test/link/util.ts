export function rangeArray(start: number, count: number): number[] {
    return Array.from(Array(count).keys()).map((i) => i + start);
}

export function toBuffer(data: Array<number | string>): Uint8Array {
    return new Uint8Array(data.map((d) => (typeof d == "string" ? d.charCodeAt(0) : d)));
}
