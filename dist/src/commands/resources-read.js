import { Arg, Command, Opt } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice } from "./util.js";
import fs from "fs";
const cmd = new Command("Read a resource from device", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
        const name = args["name"];
        const outfile = options["outfile"];
        const device = await getDevice(port, baudrate, socket, env);
        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });
        const data = await device.uploader.readResource(name).catch((err) => {
            stderr.write("Error: " + err + "\n");
            throw 1;
        });
        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
        if (outfile) {
            fs.writeFileSync(outfile, data);
        }
        else {
            stdout.write(data);
        }
    },
    options: {
        "outfile": new Opt("file to save the data into")
    },
    args: [
        new Arg("name", "Name of the resource", { required: true }),
    ],
    chainable: true
});
export default cmd;
//# sourceMappingURL=resources-read.js.map