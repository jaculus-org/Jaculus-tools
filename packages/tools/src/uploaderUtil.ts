import * as fs from "fs";
import { Uploader } from "@jaculus/device";
import { UploaderCommand, UploaderCommandStrings } from "@jaculus/device/dist/uploader.js";
import { logger } from "./logger.js";
import path from "path";

export async function upload(
    uploader: Uploader,
    from: string,
    to: string
): Promise<UploaderCommand> {
    logger.info("Uploading " + from + " to " + to);
    if (fs.lstatSync(from).isDirectory()) {
        const files = fs.readdirSync(from);

        await uploader.createDirectory(to).catch((cmd: UploaderCommand) => {
            throw "Failed to create directory: " + UploaderCommandStrings[cmd];
        });
        for (const file of files) {
            await upload(uploader, path.join(from, file), to + "/" + file).catch((err) => {
                throw err;
            });
        }
        return UploaderCommand.OK;
    } else {
        const data = fs.readFileSync(from);

        await uploader.writeFile(to, data).catch((cmd: UploaderCommand) => {
            throw "Failed to write file (" + to + "): " + UploaderCommandStrings[cmd];
        });
        return UploaderCommand.OK;
    }
}

export async function push(uploader: Uploader, from: string, to: string): Promise<UploaderCommand> {
    logger.verbose("Pushing " + from + " to " + to);
    if (!fs.lstatSync(from).isDirectory()) {
        throw "Source must be a directory";
    }

    const files = fs.readdirSync(from);
    for (const file of files) {
        await upload(uploader, path.join(from, file), to + "/" + file).catch((err) => {
            throw err;
        });
    }
    return UploaderCommand.OK;
}

export async function pullFile(
    uploader: Uploader,
    from: string,
    to: string
): Promise<UploaderCommand> {
    logger.info("Pulling " + from + " to " + to);

    const data = await uploader.readFile(from).catch((cmd: UploaderCommand) => {
        throw "Failed to read file: " + UploaderCommandStrings[cmd];
    });

    fs.writeFileSync(to, data);

    return UploaderCommand.OK;
}

export async function pullDir(
    uploader: Uploader,
    from: string,
    to: string
): Promise<UploaderCommand> {
    logger.info("Pulling " + from + " to " + to);

    const files = await uploader.listDirectory(from).catch((cmd: UploaderCommand) => {
        throw "Failed to list directory: " + UploaderCommandStrings[cmd];
    });

    if (!fs.existsSync(to)) {
        fs.mkdirSync(to);
    }
    if (!fs.lstatSync(to).isDirectory()) {
        throw "Destination must be a directory";
    }
    if (fs.readdirSync(to).length > 0) {
        throw "Destination directory is not empty";
    }

    for (const file of files) {
        const name = file[0];
        const isDir = file[1];
        if (isDir) {
            await pullDir(uploader, from + "/" + name, to + "/" + name).catch((err) => {
                throw err;
            });
        } else {
            await pullFile(uploader, from + "/" + name, to + "/" + name).catch((err) => {
                throw err;
            });
        }
    }
    return UploaderCommand.OK;
}

export async function pull(uploader: Uploader, from: string, to: string): Promise<UploaderCommand> {
    logger.verbose("Pulling " + from + " to " + to);

    const [, isDir] = await uploader.listDirectory(from).catch((err) => {
        throw "Failed to get file type: " + err;
    });

    if (isDir) {
        return pullDir(uploader, from, to);
    }

    return pullFile(uploader, from, to);
}
