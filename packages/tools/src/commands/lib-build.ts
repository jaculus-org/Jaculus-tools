import { stdout } from "process";
import { Command, Opt } from "./lib/command.js";
import fs from "fs";
import { compileLibrary } from "@jaculus/project/compiler";
import { logger } from "../logger.js";

const cmd = new Command("List libraries from project package.json", {
    action: async (options: Record<string, string | boolean>) => {
        const transpileOnly = options["transpileOnly"] as boolean;
        if (await compileLibrary(fs, process.cwd(), stdout, logger, transpileOnly)) {
            logger.info("Compiled successfully\n");
        } else {
            logger.error("Compilation failed\n");
            throw 1;
        }
    },
    options: {
        transpileOnly: new Opt(
            "Transpile only, skip type validation (still emits JS/d.ts on type errors)",
            { isFlag: true }
        ),
    },
    chainable: true,
});

export default cmd;
