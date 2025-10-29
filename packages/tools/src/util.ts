import { RequestFunction } from "@jaculus/project/fs";
import { getUri } from "get-uri";
import * as path from "path";
import * as fs from "fs";

export const uriRequest: RequestFunction = async (
    baseUri: string,
    libFile: string
): Promise<Uint8Array> => {
    const uri = path.join(baseUri, libFile);

    // Handle file URIs directly to avoid stream issues
    if (uri.startsWith("file:")) {
        const filePath = uri.replace("file:", "");
        return new Uint8Array(fs.readFileSync(filePath));
    }

    const stream = await getUri(uri);
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return new Uint8Array(Buffer.concat(chunks));
};
