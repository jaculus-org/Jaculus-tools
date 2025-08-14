import { InputPacketCommunicator, OutputPacketCommunicator } from "../link/communicator.js";
export declare enum UploaderCommand {
    READ_FILE = 1,
    WRITE_FILE = 2,
    DELETE_FILE = 3,
    LIST_DIR = 4,
    CREATE_DIR = 5,
    DELETE_DIR = 6,
    FORMAT_STORAGE = 7,
    LIST_RESOURCES = 8,
    READ_RESOURCE = 9,
    HAS_MORE_DATA = 16,
    LAST_DATA = 17,
    OK = 32,
    ERROR = 33,
    NOT_FOUND = 34,
    CONTINUE = 35,
    LOCK_NOT_OWNED = 36,
    GET_DIR_HASHES = 37
}
export declare const UploaderCommandStrings: Record<UploaderCommand, string>;
export declare class Uploader {
    private _in;
    private _out;
    private _onData?;
    private _onDataComplete?;
    private _onOk?;
    private _onError?;
    private _onContinue?;
    constructor(in_: InputPacketCommunicator, out: OutputPacketCommunicator);
    waitContinue(callback: () => void): Promise<void>;
    private processPacket;
    readFile(path_: string): Promise<Buffer>;
    writeFile(path_: string, data: Buffer): Promise<UploaderCommand>;
    deleteFile(path_: string): Promise<UploaderCommand>;
    listDirectory(path_: string, flags?: string): Promise<[string, boolean, number][]>;
    createDirectory(path_: string): Promise<UploaderCommand>;
    deleteDirectory(path_: string): Promise<UploaderCommand>;
    upload(from: string, to: string): Promise<UploaderCommand>;
    push(from: string, to: string): Promise<UploaderCommand>;
    private pullFile;
    private pullDir;
    pull(from: string, to: string): Promise<UploaderCommand>;
    formatStorage(): Promise<UploaderCommand>;
    getDirHashes(path_: string): Promise<[string, string][]>;
    listResources(): Promise<[string, number][]>;
    readResource(name: string): Promise<Buffer>;
}
//# sourceMappingURL=uploader.d.ts.map