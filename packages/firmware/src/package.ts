import { getUri } from "get-uri";
import { Archive } from "@obsidize/tar-browserify";
import pako from "pako";
import * as espPlatform from "./esp32/esp32.js";
import { Manifest, parseManifest } from "./manifest.js";

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

export class Package {
    private manifest: Manifest;
    private data: Record<string, Uint8Array>;

    constructor(manifest: Manifest, data: Record<string, Uint8Array>) {
        this.manifest = manifest;
        this.data = data;
    }

    public getManifest(): Manifest {
        return this.manifest;
    }

    public getData(): Record<string, Uint8Array> {
        return this.data;
    }

    public async flash(port: string, noErase: boolean): Promise<void> {
        switch (this.manifest.getPlatform()) {
            case "esp32":
                await espPlatform.flash(this, port, noErase);
                break;
            default:
                throw new Error("Unsupported platform");
        }
    }

    public info(): string {
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
export async function loadPackage(uri: string): Promise<Package> {
    const stream = await getUri(uri);
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    const archive = Buffer.concat(chunks);

    let manifest: Manifest = new Manifest("", "", "", { chip: "", partitions: [] });
    const files: Record<string, Uint8Array> = {};

    for await (const entry of Archive.read(pako.ungzip(archive))) {
        if (!entry.isFile()) {
            continue;
        }
        if (entry.fileName === "manifest.json") {
            manifest = parseManifest(new TextDecoder().decode(entry.content!));
        } else {
            files[entry.fileName] = entry.content!;
        }
    }

    return new Package(manifest, files);
}
