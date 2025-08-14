import { Command, Opt } from "./lib/command.js";
import path from "path";
import { compile } from "../code/compiler.js";
import * as fs from "fs";
import { stderr } from "process";
function listDts(dir) {
    let dts = [];
    for (const file of fs.readdirSync(dir)) {
        if (fs.lstatSync(path.join(dir, file)).isDirectory()) {
            dts = dts.concat(listDts(path.join(dir, file)));
        }
        else if (file.endsWith(".d.ts")) {
            dts.push(path.join(dir, file));
        }
    }
    return dts;
}
const cmd = new Command("Build TypeScript project", {
    action: async (options) => {
        const path_ = options["input"];
        const parentDir = path.dirname(path_);
        const outDir = path.join(parentDir, "build");
        if (compile(path_, outDir)) {
            stderr.write("Compiled successfully\n");
        }
        else {
            stderr.write("Compilation failed\n");
            throw 1;
        }
    },
    options: {
        "input": new Opt("The input directory", { required: true, defaultValue: "./" }),
    },
    chainable: true
});
export default cmd;
//# sourceMappingURL=build.js.map