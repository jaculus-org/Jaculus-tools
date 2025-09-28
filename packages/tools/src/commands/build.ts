import { Command, Opt } from "./lib/command.js";
import * as path from "path";
import { stderr } from "process";
import { compile } from "@jaculus/project/compiler";
import { logger } from "../logger.js";
import * as fs from "fs";

const cmd = new Command("Build TypeScript project", {
    action: async (options: Record<string, string | boolean>) => {
        const path_ = options["input"] as string;

        const parentDir = path.dirname(path_);
        const outDir = path.join(parentDir, "build");

        if (compile(fs, path_, outDir, stderr, logger, path_)) {
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
