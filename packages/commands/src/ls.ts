import { Arg, Command, Env, Opt } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice } from "./util.js";
import chalk from "chalk";

const cmd = new Command("List files in a directory", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const path = args["path"] as string;
        const directoryFlag = options["directory"] as boolean;
        const sizeFlag = options["size"] as boolean;

        const flags = (directoryFlag ? "d" : "") + (sizeFlag ? "s" : "");

        const device = await getDevice(port, baudrate, socket, env);

        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        const listing = await device.uploader.listDirectory(path, flags).catch((err) => {
            stderr.write("Error: " + err + "\n");
            throw 1;
        });

        stderr.write("Listing of " + path + ":\n");
        for (const [name, isDir, size] of listing) {
            stdout.write(
                "  " +
                    (isDir ? chalk.blueBright(name) : name) +
                    (sizeFlag ? " (" + size + " bytes)" : "") +
                    "\n"
            );
        }

        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
    },
    args: [new Arg("path", "Directory to list", { required: true })],
    options: {
        directory: new Opt("list directories themselves, not their contents", { isFlag: true }),
        size: new Opt("print the allocated size of each file, in bytes", { isFlag: true }),
    },
    chainable: true,
});

export default cmd;
