import { Arg, Command } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice } from "./util.js";
const cmd = new Command("Upload a file/directory to device", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
        const local = args["local"];
        const remote = args["remote"];
        const device = await getDevice(port, baudrate, socket, env);
        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });
        const cmd = await device.uploader.upload(local, remote).catch((err) => {
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
        new Arg("local", "File to upload", { required: true }),
        new Arg("remote", "Remote file to upload to", { required: true }),
    ],
    chainable: true
});
export default cmd;
//# sourceMappingURL=upload.js.map