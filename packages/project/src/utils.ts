import * as tar from "tar-stream";
import pako from "pako";
import { Readable } from "stream";
import { Buffer } from "buffer";

export async function extractPackageFromUri(pkgUri: string): Promise<tar.Extract> {
    const extract = tar.extract();

    // Fetch the package from the URI and convert to a readable stream
    const response = await fetch(pkgUri);
    if (!response.ok) {
        throw new Error(
            `Failed to fetch package from ${pkgUri}: ${response.status} ${response.statusText}`
        );
    }

    if (!response.body) {
        throw new Error(`No response body received from ${pkgUri}`);
    }

    // Convert web ReadableStream to Node.js Readable stream
    const stream = new Readable({
        async read() {
            const reader = response.body!.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        this.push(null);
                        break;
                    }
                    this.push(Buffer.from(value));
                }
            } catch (error) {
                this.destroy(error as Error);
            } finally {
                reader.releaseLock();
            }
        },
    });

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
