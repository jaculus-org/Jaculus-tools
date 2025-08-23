import { Command, Env } from "@jaculus/commands/lib/command.js";
import { stdout, stderr } from "process";
import { getDevice } from "@jaculus/commands/util.js";
import { version } from "../../src-appmeta/version.js";

const cmd = new Command("Get version of device firmware", {
    action: async (options: Record<string, string | boolean>, args: Record<string, string>, env: Env) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;

        stdout.write("Jaculus-tools version:\n  " + version + "\n\n");

        const device = await getDevice(port, baudrate, socket, env);

        const status = await device.controller.version().catch((err) => {
            stderr.write("Error: " + err + "\n");
            throw 1;
        });

        stdout.write("Firmware version:\n  " + status.join("\n  ") + "\n");
    },
    chainable: true
});

export default cmd;