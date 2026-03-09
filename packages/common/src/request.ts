export type RequestFunction = (baseUri: string, libFile: string) => Promise<Uint8Array>;

export async function getRequestJson(
    getRequest: RequestFunction,
    baseUri: string,
    libFile: string
): Promise<any> {
    return getRequest(baseUri, libFile).then((data) => {
        const text = new TextDecoder().decode(data);
        return JSON.parse(text);
    });
}

export class JaculusRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "JaculusRequestError";
    }
}
