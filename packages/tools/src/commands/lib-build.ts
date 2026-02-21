import { stdout } from "process";
import { Command, Opt } from "./lib/command.js";
import fs from "fs";
import path from "path";
import { stderr } from "process";
import { compileLibrary } from "@jaculus/project/compiler";

const cmd = new Command("List libraries from project package.json", {
    action: async (options: Record<string, string | boolean>) => {
        const path_ = options["input"] as string;
        const inputDir = path.resolve(path_);
        const transpileOnly = options["transpileOnly"] as boolean;

        if (await compileLibrary(fs, inputDir, stderr, stdout, transpileOnly)) {
            stderr.write("Compiled successfully\n");
        } else {
            stderr.write("Compilation failed\n");
            throw 1;
        }
    },
    options: {
        input: new Opt("The input directory", { required: true, defaultValue: "./" }),
        transpileOnly: new Opt(
            "Transpile only, skip type validation (still emits JS/d.ts on type errors)",
            { isFlag: true }
        ),
    },
    chainable: true,
});

export default cmd;
