/**
 * File system interface based on Lightning-FS API for cross-platform compatibility
 * Can be implemented with Node.js fs module or LightningFS for web
 * Copyright (c) 2018 wmhilton (MIT License)
 * Derived from https://github.com/isomorphic-git/lightning-fs/blob/main/index.d.ts
 */

export interface FSMKDirOptions {
    /**
     * Posix mode permissions
     * @default 0o777
     */
    mode: number;
}

export interface FSWriteFileOptions {
    /**
     * Posix mode permissions
     * @default 0o777
     */
    mode: number;
    encoding?: "utf8";
}

export interface FSReadFileOptions {
    encoding?: "utf8";
}

export interface FSStats {
    type: "file" | "dir";
    mode: any;
    size: number;
    ino: any;
    mtimeMs: any;
    ctimeMs: any;
    uid: 1;
    gid: 1;
    dev: 1;
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
}

export interface FSBackFileOptions {
    /**
     * Posix mode permissions
     * @default 0o666
     */
    mode: number;
}

export interface FSPromisifiedFS {
    /**
     * Make directory
     * @param filepath
     * @param options
     */
    mkdir(filepath: string, options?: FSMKDirOptions): Promise<void>;

    /**
     * Remove directory
     * @param filepath
     * @param options
     */
    rmdir(filepath: string, options?: undefined): Promise<void>;

    /**
     * Read directory
     *
     * The Promise return value is an Array of strings. NOTE: To save time, it is NOT SORTED. (Fun fact: Node.js' readdir output is not guaranteed to be sorted either. I learned that the hard way.)
     * @param filepath
     * @param options
     * @returns The file list.
     */
    readdir(filepath: string, options?: undefined): Promise<string[]>;

    writeFile(
        filepath: string,
        data: Uint8Array | string,
        options?: FSWriteFileOptions | string
    ): Promise<void>;

    readFile(filepath: string, options: "utf8" | { encoding: "utf8" }): Promise<string>;
    readFile(filepath: string, options?: object): Promise<Uint8Array>;

    /**
     * Delete a file
     * @param filepath
     * @param options
     */
    unlink(filepath: string, options?: undefined): Promise<void>;

    /**
     * Rename a file or directory
     * @param oldFilepath
     * @param newFilepath
     */
    rename(oldFilepath: string, newFilepath: string): Promise<void>;

    /**
     * The result is a Stat object similar to the one used by Node but with fewer and slightly different properties and methods.
     * @param filepath
     * @param options
     */
    stat(filepath: string, options?: undefined): Promise<FSStats>;

    /**
     * Like fs.stat except that paths to symlinks return the symlink stats not the file stats of the symlink's target.
     * @param filepath
     * @param options
     */
    lstat(filepath: string, options?: undefined): Promise<FSStats>;

    /**
     * Create a symlink at filepath that points to target.
     * @param target
     * @param filepath
     */
    symlink(target: string, filepath: string): Promise<void>;

    /**
     * Read the target of a symlink.
     * @param filepath
     * @param options
     * @returns The link string.
     */
    readlink(filepath: string, options?: undefined): Promise<string>;
}

// Keep the FS namespace for backward compatibility
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace FS {
    export type PromisifiedFS = FSPromisifiedFS;
    export type MKDirOptions = FSMKDirOptions;
    export type WriteFileOptions = FSWriteFileOptions;
    export type ReadFileOptions = FSReadFileOptions;
    export type Stats = FSStats;
}

export interface FSInterface {
    /**
     * Make directory
     * @param filepath
     * @param options
     * @param cb
     */
    mkdir(filepath: string, options: FSMKDirOptions | undefined, cb: (err: Error) => void): void;

    /**
     * Remove directory
     * @param filepath
     * @param options
     * @param cb
     */
    rmdir(filepath: string, options: undefined, cb: (err: Error) => void): void;

    /**
     * Read directory
     *
     * The callback return value is an Array of strings. NOTE: To save time, it is NOT SORTED. (Fun fact: Node.js' readdir output is not guaranteed to be sorted either. I learned that the hard way.)
     * @param filepath
     * @param options
     * @param cb
     */
    readdir(filepath: string, options: undefined, cb: (err: Error, files: string[]) => void): void;

    writeFile(
        filepath: string,
        data: Uint8Array | string,
        options: FSWriteFileOptions | undefined | string,
        cb: (err: Error) => void
    ): void;

    readFile(
        filepath: string,
        options: "utf8" | { encoding: "utf8" },
        cb: (err: Error, data: string) => void
    ): void;
    readFile(
        filepath: string,
        options: object | void,
        cb: (err: Error, data: Uint8Array) => void
    ): void;

    /**
     * Delete a file
     * @param filepath
     * @param options
     * @param cb
     */
    unlink(filepath: string, options: undefined, cb: (err: Error) => void): void;

    /**
     * Rename a file or directory
     * @param oldFilepath
     * @param newFilepath
     * @param cb
     */
    rename(oldFilepath: string, newFilepath: string, cb: (err: Error) => void): void;

    /**
     * The result is a Stat object similar to the one used by Node but with fewer and slightly different properties and methods.
     * @param filepath
     * @param options
     * @param cb
     */
    stat(filepath: string, options: undefined, cb: (err: Error, stats: FSStats) => void): void;

    /**
     * Like fs.stat except that paths to symlinks return the symlink stats not the file stats of the symlink's target.
     * @param filepath
     * @param options
     * @param cb
     */
    lstat(filepath: string, options: undefined, cb: (err: Error, stats: FSStats) => void): void;

    /**
     * Create a symlink at filepath that points to target.
     * @param target
     * @param filepath
     * @param cb
     */
    symlink(target: string, filepath: string, cb: (err: Error) => void): void;

    /**
     * Read the target of a symlink.
     * @param filepath
     * @param options
     * @param cb
     */
    readlink(
        filepath: string,
        options: undefined,
        cb: (err: Error, linkString: string) => void
    ): void;

    readonly promises: FSPromisifiedFS;
}

export type { FSInterface as FS };
