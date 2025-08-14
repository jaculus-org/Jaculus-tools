import { Arg, Command } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice } from "./util.js";
const cmd = new Command("Delete a directory on device", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
        const path = args["path"];
        const device = await getDevice(port, baudrate, socket, env);
        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });
        const cmd = await device.uploader.deleteDirectory(path).catch((err) => {
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
        new Arg("path", "Directory to delete", { required: true }),
    ],
    chainable: true
});
export default cmd;
//# sourceMappingURL=rmdir.js.map