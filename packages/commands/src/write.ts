import { Arg, Command, Env } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice } from "./util.js";
import * as readline from "readline";


const cmd = new Command("Write a file to device", {
    action: async (options: Record<string, string | boolean>, args: Record<string, string>, env: Env) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const path = args["path"] as string;

        let str = "";
        await new Promise((resolve, reject) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.setPrompt("");
            rl.on("line", (line: string) => {
                if (line == "\\") {
                    rl.removeAllListeners("close");
                    rl.close();
                    resolve(null);
                    return;
                }
                str += line + "\n";
            });
            rl.on("close", () => {
                stderr.write("Write cancelled\n");
                reject(null);
            });
        })
            .catch((err) => {
                stderr.write("Error: " + err + "\n");
                throw 1;
            });

        const device = await getDevice(port, baudrate, socket, env);

        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        const cmd = await device.uploader.writeFile(path, Buffer.from(str, "utf-8")).catch((err) => {
            stderr.write("Error: " + err + "\n");
            throw 1;
        });

        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });

        stdout.write(cmd.toString() + "\n");
    },
    args: [
        new Arg("path", "File to write", { required: true }),
    ],
    chainable: true
});

export default cmd;
