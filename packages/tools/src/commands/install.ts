import { Command, Opt } from "./lib/command.js";

import { loadPackage } from "@jaculus/fw/package.js";
import { stderr, stdout } from "process";

const cmd = new Command("Install Jaculus to device", {
    action: async (options: Record<string, string | boolean>) => {
        const pkgPath = options["package"] as string;
        const port = options["port"] as string;
        const info = options["info"] as boolean;
        const noErase = options["no-erase"] as boolean;

        if (!port && !info) {
            stderr.write("Port not specified\n");
            throw 1;
        }

        stderr.write("Loading package...\n");

        const pkg = await loadPackage(pkgPath);

        stdout.write("Version: " + pkg.getManifest().getVersion() + "\n");
        stdout.write("Board: " + pkg.getManifest().getBoard() + "\n");
        stdout.write("Platform: " + pkg.getManifest().getPlatform() + "\n");
        stdout.write("\n");

        if (info) {
            stdout.write(pkg.info());
        } else {
            await pkg.flash(port, noErase);
        }
    },
    args: [],
    options: {
        package: new Opt("Uri pointing to the package file", { required: true }),
        info: new Opt("Show package info", { isFlag: true }),
        "no-erase": new Opt("Do not erase storage partitions", { isFlag: true }),
    },
    chainable: false,
});

export default cmd;
