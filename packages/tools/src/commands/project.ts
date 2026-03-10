import { Arg, Command, Env, Opt } from "./lib/command.js";
import { stderr } from "process";
import { getDevice } from "./util.js";
import fs from "fs";
import { Archive } from "@obsidize/tar-browserify";
import pako from "pako";
import { getUri } from "get-uri";
import { concatUint8Arrays } from "@jaculus/common";
import { JacDevice } from "@jaculus/device";
import { logger } from "../logger.js";
import { ProjectPackage } from "@jaculus/project";
import { createFromPackage, updateFromPackage } from "@jaculus/project/creation";

async function loadFromDevice(device: JacDevice): Promise<Uint8Array> {
    await device.controller.lock().catch((err) => {
        stderr.write("Error locking device: " + err + "\n");
        throw 1;
    });

    const data = await device.uploader.readResource("ts-examples").catch((err) => {
        stderr.write("Error: " + err + "\n");
        throw 1;
    });

    await device.controller.unlock().catch((err) => {
        stderr.write("Error unlocking device: " + err + "\n");
        throw 1;
    });

    return data;
}

async function loadPackage(
    options: Record<string, string | boolean>,
    env: Env
): Promise<ProjectPackage> {
    const pkgUri = options["package"] as string;
    const fromDevice = options["from-device"] as boolean;

    if (fromDevice && pkgUri) {
        logger?.error("Cannot specify both --from-device and --package options");
        throw 1;
    }
    if (!fromDevice && !pkgUri) {
        logger?.error("Either --from-device or --package option must be specified");
        throw 1;
    }

    let archive;
    if (fromDevice) {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;

        logger.verbose("Connecting to device...");
        const device = await getDevice(port, baudrate, socket, env);

        archive = await loadFromDevice(device);
    } else {
        const stream = await getUri(pkgUri);
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream) {
            chunks.push(chunk as Uint8Array);
        }
        archive = concatUint8Arrays(chunks);
    }

    const dirs: string[] = [];
    const files: Record<string, Uint8Array> = {};

    for await (const entry of Archive.read(pako.ungzip(archive))) {
        if (entry.isDirectory()) {
            dirs.push(entry.fileName);
        } else if (entry.isFile()) {
            files[entry.fileName] = entry.content!;
        }
    }

    return { dirs, files };
}

export const projectCreate = new Command("Create project from package", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const outPath = args["path"] as string;
        const dryRun = options["dry-run"] as boolean;
        const pkg = await loadPackage(options, env);
        await createFromPackage(fs, outPath, pkg, logger, dryRun);
    },
    options: {
        package: new Opt("Uri pointing to the package file"),
        "from-device": new Opt("Get package from device", { isFlag: true }),
        "dry-run": new Opt("Do not write files, just show what would be done", { isFlag: true }),
    },
    args: [new Arg("path", "Name of project directory", { required: true })],
    chainable: true,
});

export const projectUpdate = new Command("Update existing project from package skeleton", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const outPath = args["path"] as string;
        const dryRun = options["dry-run"] as boolean;
        const pkg = await loadPackage(options, env);
        await updateFromPackage(fs, outPath, pkg, logger, dryRun);
    },
    options: {
        package: new Opt("Uri pointing to the package file"),
        "from-device": new Opt("Get package from device", { isFlag: true }),
        "dry-run": new Opt("Do not write files, just show what would be done", { isFlag: true }),
    },
    args: [new Arg("path", "Name of project directory", { required: true })],
    chainable: true,
});
