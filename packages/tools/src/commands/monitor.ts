import { Command, Env, Opt } from "./lib/command.js";
import { stdout } from "process";
import { getDevice } from "./util.js";
import chalk from "chalk";
import readline from "readline";

const cmd = new Command("Monitor program output", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const echo = !(options["no-echo"] as boolean);

        const rl = readline.createInterface({ input: process.stdin });
        readline.emitKeypressEvents(process.stdin, rl);
        process.stdin.setRawMode(true);

        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;

        const device = await getDevice(port, baudrate, socket, env);

        device.programOutput.onData((data) => {
            stdout.write(data);
        });
        device.programError.onData((data) => {
            stdout.write(chalk.red(data));
        });

        await new Promise((resolve) => {
            process.stdin.on("keypress", (str, key) => {
                if (key.ctrl && key.name === "c") {
                    device.programOutput.onData(undefined);
                    device.programError.onData(undefined);
                    process.stdin.setRawMode(false);
                    rl.close();
                    resolve(null);
                } else {
                    if (echo) {
                        if (key.sequence === "\r") {
                            stdout.write("\r\n");
                        } else if (str) {
                            stdout.write(str);
                        }
                    }
                    let out = key.sequence;
                    if (out === "\r") {
                        out = "\n";
                    }
                    device.programInput.write(Buffer.from(out, "utf-8"));
                }
            });
        });
    },
    options: {
        "no-echo": new Opt("Echo input", { isFlag: true }),
    },
    chainable: true,
});

export default cmd;
