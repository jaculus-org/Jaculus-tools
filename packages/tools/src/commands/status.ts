import { Command, Env } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice } from "./util.js";

const cmd = new Command("Get status of device", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;

        const device = await getDevice(port, baudrate, socket, env);

        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        const status = await device.controller.status().catch((err) => {
            stderr.write("Error: " + err + "\n");
            throw 1;
        });

        stdout.write("Running: " + status.running + "\n");
        if (!status.running) {
            stdout.write("Last exit code: " + status.exitCode + "\n");
        }
        stdout.write(status.status + "\n");

        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
    },
    chainable: true,
});

export default cmd;
