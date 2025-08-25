import { Command, Env, Opt } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice } from "./util.js";

const cmd = new Command("Start a program", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const entry = options["entry"] as string;

        const device = await getDevice(port, baudrate, socket, env);

        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        await device.controller.start(entry).catch((err) => {
            stderr.write("Error: " + err + "\n");
            throw 1;
        });

        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });

        stdout.write("Started\n");
    },
    options: {
        entry: new Opt("Remote file to run", { defaultValue: "index.js", required: true }),
    },
    chainable: true,
});

export default cmd;
