export interface Partition {
    name: string;
    address: string;
    file: string;
    isStorage?: boolean;
}

export interface ManifestConfig {
    chip: string;
    flashBaud?: number;
    partitions: Partition[];
}

export class Manifest {
    private readonly board: string;
    private readonly version: string;
    private readonly platform: string;
    private readonly config: ManifestConfig;

    constructor(board: string, version: string, platform: string, config: ManifestConfig) {
        this.board = board;
        this.version = version;
        this.platform = platform;
        this.config = config;
    }

    public getBoard(): string {
        return this.board;
    }

    public getVersion(): string {
        return this.version;
    }

    public getPlatform(): string {
        return this.platform;
    }

    public getConfig(): ManifestConfig {
        return this.config;
    }
}

/**
 * Parse the manifest file
 * @param data Manifest file data
 * @returns The manifest
 */
export function parseManifest(data: string) {
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
