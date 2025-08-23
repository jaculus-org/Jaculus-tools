import { Command, Opt } from "./lib/command.js";
import * as path from "path";
import { compile } from "@jaculus/code/compiler.js";
import * as fs from "fs";
import { stderr } from "process";


function listDts(dir: string): string[] {  // eslint-disable-line @typescript-eslint/no-unused-vars
    let dts: string[] = [];
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
    action: async (options: Record<string, string | boolean>) => {
        const path_ = options["input"] as string;

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
