import { getUri } from "get-uri";
import * as tar from "tar-stream";
import * as espPlatform from "./esp32/esp32.js";
import * as zlib from "zlib";
/**
 * Module for loading and flashing package files
 *
 * Package file is a tar.gz archive containing a manifest.json file and arbitrary files,
 * which can be used by the flasher for the corresponding platform.
 *
 * The manifest.json file contains the following fields:
 * - board: The board name
 * - version: The version of the package
 * - platform: The platform the package is for (determines which flasher to use)
 * - config: An arbitrary json object containing configuration for the flasher (documented in the flasher module)
 *
 * Example manifest.json can be found in the flasher module.
 */
export class Manifest {
    constructor(board, version, platform, config) {
        this.board = board;
        this.version = version;
        this.platform = platform;
        this.config = config;
    }
    getBoard() {
        return this.board;
    }
    getVersion() {
        return this.version;
    }
    getPlatform() {
        return this.platform;
    }
    getConfig() {
        return this.config;
    }
}
/**
 * Parse the manifest file
 * @param data Manifest file data
 * @returns The manifest
 */
function parseManifest(data) {
    const manifest = JSON.parse(data);
    const board = manifest["board"];
    if (!board) {
        throw new Error("No board defined in manifest");
    }
    const version = manifest["version"];
    if (!version) {
        throw new Error("No version defined in manifest");
    }
    const platform = manifest["platform"];
    if (!platform) {
        throw new Error("No platform defined in manifest");
    }
    const config = manifest["config"];
    if (!config) {
        throw new Error("No config defined in manifest");
    }
    return new Manifest(board, version, platform, config);
}
export class Package {
    constructor(manifest, data) {
        this.manifest = manifest;
        this.data = data;
    }
    getManifest() {
        return this.manifest;
    }
    getData() {
        return this.data;
    }
    async flash(port, noErase) {
        switch (this.manifest.getPlatform()) {
            case "esp32":
                await espPlatform.flash(this, port, noErase);
                break;
            default:
                throw new Error("Unsupported platform");
        }
        return;
    }
    info() {
        switch (this.manifest.getPlatform()) {
            case "esp32":
                return espPlatform.info(this);
            default:
                throw new Error("Unsupported platform");
        }
    }
}
/**
 * Load the package file from the given URI
 * @param uri Uri to the package file (.tar.gz)
 * @returns The package file and manifest
 */
export async function loadPackage(uri) {
    const stream = await getUri(uri);
    const extract = tar.extract();
    return new Promise((resolve, reject) => {
        let manifest = new Manifest("", "", "", {});
        const files = {};
        extract.on("entry", (header, stream, next) => {
            if (header.name === "manifest.json") {
                let str = "";
                stream.on("data", (chunk) => {
                    str += chunk;
                });
                stream.on("end", () => {
                    manifest = parseManifest(str);
                    next();
                });
                stream.on("error", (err) => {
                    reject(err);
                });
            }
            else {
                const chunks = [];
                stream.on("data", (chunk) => {
                    chunks.push(chunk);
                });
                stream.on("end", () => {
                    files[header.name] = Buffer.concat(chunks);
                    next();
                });
                stream.on("error", (err) => {
                    reject(err);
                });
            }
        });
        extract.on("finish", () => {
            resolve(new Package(manifest, files));
        });
        extract.on("error", (err) => {
            reject(err);
        });
        stream.pipe(zlib.createGunzip()).pipe(extract);
    });
}
//# sourceMappingURL=package.js.map