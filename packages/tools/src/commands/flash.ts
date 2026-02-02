import { Command, Env, Opt } from "./lib/command.js";
import { stderr, stdout } from "process";
import { getDevice } from "./util.js";
import { logger } from "../logger.js";
import fs from "fs";
import { loadPackageJson, Project, Registry } from "@jaculus/project";
import { uriRequest } from "../util.js";
import path, { dirname } from "path";

const cmd = new Command("Flash code to device (replace contents of ./code)", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const projectPath = options["path"] as string;

        const device = await getDevice(port, baudrate, socket, env);

        const pkg = await loadPackageJson(fs, path.join(projectPath, "package.json"));
        const registry = new Registry(pkg?.registry || [], uriRequest);
        const project = new Project(fs, projectPath, stdout, stderr, registry);

        const files = await project.getFlashFiles();

        await device.controller.lock().catch((err: unknown) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        await device.controller.stop().catch((err: unknown) => {
            logger.verbose("Error stopping device: " + err);
        });

        try {
            logger.info("Getting current data hashes");
            const dataHashes = await device.uploader.getDirHashes("code").catch((err: unknown) => {
                logger.verbose("Error getting data hashes: " + err);
                throw err;
            });

            await device.uploader.uploadIfDifferent(dataHashes, files, "code");
        } catch {
            logger.info("Deleting old code");
            await device.uploader.deleteDirectory("code").catch((err: unknown) => {
                logger.verbose("Error deleting directory: " + err);
            });

            for (const [filePath, content] of Object.entries(files)) {
                const fullPath = `code/${filePath}`;
                const dirPath = dirname(fullPath);
                if (dirPath) {
                    await device.uploader.createDirectory(dirPath).catch((err: unknown) => {
                        logger.verbose("Error creating directory: " + err);
                    });
                }
                await device.uploader.writeFile(fullPath, content).catch((err: unknown) => {
                    logger.verbose("Error writing file: " + err);
                });
            }
        }

        await device.controller.start("index.js").catch((err: unknown) => {
            logger.verbose("Error starting program: " + err);
            throw 1;
        });

        await device.controller.unlock().catch((err: unknown) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
    },
    options: {
        path: new Opt("Project path", { required: true, defaultValue: "." }),
    },
    chainable: true,
});

export default cmd;
