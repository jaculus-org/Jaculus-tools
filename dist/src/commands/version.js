import { Command } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice } from "./util.js";
import { version } from "../project/version.js";
const cmd = new Command("Get version of device firmware", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
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
//# sourceMappingURL=version.js.map