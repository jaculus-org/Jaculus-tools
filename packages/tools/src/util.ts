import { getUri } from "get-uri";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { RequestFunction, JaculusRequestError, concatUint8Arrays } from "@jaculus/common";

export const uriRequest: RequestFunction = async (
    baseUri: string,
    libFile: string
): Promise<Uint8Array> => {
    if (libFile === "") {
        return new Uint8Array();
    }

    const uri = new URL(
        libFile.replace(/^\/+/, ""),
        baseUri.endsWith("/") ? baseUri : `${baseUri}/`
    ).toString();

    if (uri.startsWith("file:")) {
        const filePath = fileURLToPath(uri);
        try {
            return new Uint8Array(fs.readFileSync(filePath));
        } catch (error) {
            throw new JaculusRequestError(
                `Failed to read ${filePath}: ${(error as Error).message}`
            );
        }
    }

    try {
        const stream = await getUri(uri);
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk as Uint8Array);
        }
        return concatUint8Arrays(chunks);
    } catch (error) {
        throw new JaculusRequestError(`Failed to fetch ${uri}: ${(error as Error).message}`);
    }
};
