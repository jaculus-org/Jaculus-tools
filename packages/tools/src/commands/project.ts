import { Arg, Command, Env, Opt } from "./lib/command.js";
import { getDevice } from "./util.js";
import fs from "fs";
import { logger } from "../logger.js";
import {
    createProject,
    loadPackageDevice,
    loadPackageUri,
    updateProject,
} from "@jaculus/project/project";
import { ArchiveEntry } from "@obsidize/tar-browserify";

const fsp = fs.promises;

async function loadPackage(
    options: Record<string, string | boolean>,
    env: Env
): Promise<AsyncIterable<ArchiveEntry>> {
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

    if (fromDevice) {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;

        const device = await getDevice(port, baudrate, socket, env);
        return loadPackageDevice(device);
    } else {
        return loadPackageUri(pkgUri, fsp);
    }
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

        await createProject(fsp, outPath, pkg, dryRun, logger);
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

        updateProject(fsp, outPath, pkg, dryRun, logger);
    },
    options: {
        package: new Opt("Uri pointing to the package file"),
        "from-device": new Opt("Get package from device", { isFlag: true }),
        "dry-run": new Opt("Do not write files, just show what would be done", { isFlag: true }),
    },
    args: [new Arg("path", "Name of project directory", { required: true })],
    chainable: true,
});
