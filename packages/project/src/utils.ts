import * as tar from "tar-stream";
import { getUri } from "get-uri";
import pako from "pako";

export async function extractPackageFromUri(pkgUri: string): Promise<tar.Extract> {
    const extract = tar.extract();
    const stream = await getUri(pkgUri);

    await new Promise((resolve, reject) => {
        const inflator = new pako.Inflate();
        inflator.onData = (chunk: Uint8Array) => {
            const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
            extract.write(u8);
        };
        inflator.onEnd = (status: number) => {
            if (status !== 0) {
                reject(new Error("Failed to decompress package"));
                return;
            }
            extract.end();
            resolve(null);
        };
        stream.on("data", (chunk: Buffer) => {
            inflator.push(chunk, false);
        });
        stream.on("end", () => {
            inflator.push(new Uint8Array(0), true);
        });
    });
    return extract;
}
