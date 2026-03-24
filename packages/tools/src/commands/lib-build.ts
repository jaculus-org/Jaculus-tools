import { Command, Opt } from "./lib/command.js";
import fs from "fs";
import { compileProjectPath } from "@jaculus/project/compiler";
import { logger } from "../logger.js";

const cmd = new Command("List libraries from project package.json", {
    action: async (options: Record<string, string | boolean>) => {
        const noCheck = options["no-check"] as boolean;
        if (await compileProjectPath(fs, process.cwd(), logger, noCheck)) {
            logger.info("Compiled successfully\n");
        } else {
            logger.error("Compilation failed\n");
            throw 1;
        }
    },
    options: {
        "no-check": new Opt(
            "Compile without type checking, emits JavaScript even if there are type errors",
            { isFlag: true }
        ),
    },
    chainable: true,
});

export default cmd;
