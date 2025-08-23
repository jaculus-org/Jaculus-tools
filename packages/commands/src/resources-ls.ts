import { Command, Env } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice } from "./util.js";


const cmd = new Command("List available resources", {
    action: async (options: Record<string, string | boolean>, args: Record<string, string>, env: Env) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;

        const device = await getDevice(port, baudrate, socket, env);

        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        const listing = await device.uploader.listResources().catch((err) => {
            stderr.write("Error: " + err + "\n");
            throw 1;
        });

        stderr.write("Available resources:\n");
        for (const [name, size] of listing) {
            stdout.write("  " + name + " (" + size + " bytes)\n");
        }

        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
    },
    chainable: true
});

export default cmd;
