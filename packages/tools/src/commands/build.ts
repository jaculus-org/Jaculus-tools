import { Command, Opt } from "./lib/command.js";
import * as path from "path";
import { stderr, stdout } from "process";
import { compileProject } from "@jaculus/project/compiler";
import * as fs from "fs";
import { logger } from "../logger.js";

const cmd = new Command("Build TypeScript project", {
    action: async (options: Record<string, string | boolean>) => {
        const path_ = options["input"] as string;
        const inputDir = path.resolve(path_);

        if (await compileProject(fs, inputDir, stdout, logger)) {
            stderr.write("Compiled successfully\n");
        } else {
            stderr.write("Compilation failed\n");
            throw 1;
        }
    },
    options: {
        input: new Opt("The input directory", { required: true, defaultValue: "./" }),
    },
    chainable: true,
});

export default cmd;
