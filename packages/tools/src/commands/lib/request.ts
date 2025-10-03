import { Archive, ArchiveEntry } from "@obsidize/tar-browserify";
import pako from "pako";
import { getUri } from "get-uri";
import { logger } from "../../logger.js";

/**
 * Load a package from a URI - Node implementation
 * For web implementation, see @jaculus/jacly
 * @param pkgUri URI of the package to load (http://, https://, file://)
 * @param _fsp File system promises interface, required for file:// URIs
 * @returns Async iterable of archive entries
 */

export async function loadPackageUri(pkgUri: string): Promise<AsyncIterable<ArchiveEntry>> {
    const stream = await getUri(pkgUri);
    let buffer = new Uint8Array(0);

    await new Promise((resolve, reject) => {
        const inflator = new pako.Inflate();
        inflator.onData = (chunk) => {
            const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
            buffer = Buffer.concat([buffer, Buffer.from(u8)]);
        };
        inflator.onEnd = (status) => {
            logger.verbose("Decompression finished with status " + status);
            if (status !== 0) {
                reject(new Error("Failed to decompress package"));
                return;
            }
            resolve(null);
        };
        stream.on("data", (chunk: Buffer) => {
            logger.verbose("Received " + chunk.length + " bytes");
            inflator.push(chunk, false);
        });
        stream.on("end", () => {
            logger.verbose("Download complete");
            inflator.push(new Uint8Array(0), true);
        });
    });

    return Archive.read(buffer);
}
