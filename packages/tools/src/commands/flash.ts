import { Command, Env, Opt } from "./lib/command.js";
import { stderr } from "process";
import { getDevice } from "./util.js";
import { logger } from "../logger.js";
import { upload, uploadIfDifferent } from "../uploaderUtil.js";

const cmd = new Command("Flash code to device (replace contents of ./code)", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const from = options["from"] as string;

        const device = await getDevice(port, baudrate, socket, env);

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
                stderr.write("Error getting data hashes: " + err + "\n");
                throw err;
            });

            await uploadIfDifferent(device.uploader, dataHashes, from, "code");
        } catch {
            logger.info("Deleting old code");
            await device.uploader.deleteDirectory("code").catch((err: unknown) => {
                logger.verbose("Error deleting directory: " + err);
            });

            const cmd = await upload(device.uploader, from, "code").catch((err: unknown) => {
                stderr.write("Error uploading: " + err + "\n");
                throw 1;
            });
            stderr.write(cmd.toString() + "\n");
        }

        await device.controller.start("index.js").catch((err: unknown) => {
            stderr.write("Error starting program: " + err + "\n");
            throw 1;
        });

        await device.controller.unlock().catch((err: unknown) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
    },
    options: {
        from: new Opt("Directory to flash", { required: true, defaultValue: "build" }),
    },
    chainable: true,
});

export default cmd;
