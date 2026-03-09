import { stdout } from "process";
import { Command, Opt } from "./lib/command.js";
import fs from "fs";
import { Project } from "@jaculus/project";
import { logger } from "../logger.js";

const cmd = new Command("List libraries from project package.json", {
    action: async (options: Record<string, string | boolean>) => {
        const projectPath = process.cwd();
        const includeResolvedLibs = options["resolved"] as boolean;

        const project = new Project(fs, projectPath, stdout, logger);
        const dependencies = await project.installedLibraries(includeResolvedLibs);
        const list = Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b));
        if (list.length === 0) {
            stdout.write("No libraries found.\n");
            return;
        }

        for (const [name, version] of list) {
            stdout.write(`${name}@${version}\n`);
        }
    },
    options: {
        resolved: new Opt("Include resolved transitive dependencies", { isFlag: true }),
    },
    chainable: true,
});

export default cmd;
