import { Command } from "./lib/command.js";
import { stderr } from "process";
import { getDevice } from "./util.js";
const cmd = new Command("Format device storage", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
        const device = await getDevice(port, baudrate, socket, env);
        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });
        const cmd = await device.uploader.formatStorage().catch((err) => {
            stderr.write("Error: " + err + "\n");
            throw 1;
        });
        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
        stderr.write(cmd.toString() + "\n");
    }
});
export default cmd;
//# sourceMappingURL=format.js.map