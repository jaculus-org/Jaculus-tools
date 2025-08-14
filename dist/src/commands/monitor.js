import { Command, Opt } from "./lib/command.js";
import { stdout } from "process";
import { getDevice } from "./util.js";
import chalk from "chalk";
import readline from "readline";
const cmd = new Command("Monitor program output", {
    action: async (options, args, env) => {
        const echo = !options["no-echo"];
        const rl = readline.createInterface({ input: process.stdin });
        readline.emitKeypressEvents(process.stdin, rl);
        process.stdin.setRawMode(true);
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
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
                }
                else {
                    if (echo) {
                        if (key.sequence === "\r") {
                            stdout.write("\r\n");
                        }
                        else if (str) {
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
    chainable: true
});
export default cmd;
//# sourceMappingURL=monitor.js.map