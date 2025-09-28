import { Arg, Command, Env, Opt } from "./lib/command.js";
import { getDevice } from "./util.js";
import fs from "fs";
import { logger } from "../logger.js";
import {
    createProject,
    loadPackageDevice,
    loadPackageUri,
    Package,
    updateProject,
} from "@jaculus/project/project";
import { FSInterface } from "@jaculus/common";

// Cast Node.js fs as FSInterface - we only use the promises API which is compatible
const fsInterface = fs as unknown as FSInterface;

async function loadPackage(options: Record<string, string | boolean>, env: Env): Promise<Package> {
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
        return loadPackageUri(pkgUri);
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

        await createProject(outPath, pkg, dryRun, fsInterface, logger);
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

        updateProject(outPath, pkg, dryRun, fsInterface, logger);
    },
    options: {
        package: new Opt("Uri pointing to the package file"),
        "from-device": new Opt("Get package from device", { isFlag: true }),
        "dry-run": new Opt("Do not write files, just show what would be done", { isFlag: true }),
    },
    args: [new Arg("path", "Name of project directory", { required: true })],
    chainable: true,
});
