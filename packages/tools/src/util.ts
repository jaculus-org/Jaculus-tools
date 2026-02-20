import { JaculusRequestError, RequestFunction } from "@jaculus/project/fs";
import { getUri } from "get-uri";
import * as fs from "fs";
import { fileURLToPath } from "url";

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
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk as Buffer);
        }
        return new Uint8Array(Buffer.concat(chunks));
    } catch (error) {
        throw new JaculusRequestError(`Failed to fetch ${uri}: ${(error as Error).message}`);
    }
};
