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
export declare class Manifest {
    private board;
    private version;
    private platform;
    private config;
    constructor(board: string, version: string, platform: string, config: Record<string, any>);
    getBoard(): string;
    getVersion(): string;
    getPlatform(): string;
    getConfig(): Record<string, any>;
}
export declare class Package {
    private manifest;
    private data;
    constructor(manifest: Manifest, data: Record<string, Buffer>);
    getManifest(): Manifest;
    getData(): Record<string, Buffer>;
    flash(port: string, noErase: boolean): Promise<void>;
    info(): string;
}
/**
 * Load the package file from the given URI
 * @param uri Uri to the package file (.tar.gz)
 * @returns The package file and manifest
 */
export declare function loadPackage(uri: string): Promise<Package>;
//# sourceMappingURL=package.d.ts.map