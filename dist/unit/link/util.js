export function rangeArray(start, count) {
    return Array.from(Array(count).keys()).map(i => i + start);
}
export function toBuffer(data) {
    return Buffer.from(data.map(d => typeof d == "string" ? d.charCodeAt(0) : d));
}
//# sourceMappingURL=util.js.map