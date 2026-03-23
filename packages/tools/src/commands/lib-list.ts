import { stdout } from "process";
import { Command, Opt } from "./lib/command.js";
import fs from "fs";
import { Project } from "@jaculus/project";
import { loadPackageJson } from "@jaculus/project/package";
import { Registry } from "@jaculus/project/registry";
import { logger } from "../logger.js";
import path from "path";
import { uriRequest } from "../util.js";

const cmd = new Command("List libraries from project package.json", {
    action: async (options: Record<string, string | boolean>) => {
        const projectPath = process.cwd();
        const all = options["all"] as boolean;

        const project = new Project(fs, projectPath, logger);
        const registry = all
            ? new Registry(
                  (await loadPackageJson(fs, path.join(projectPath, "package.json"))).registry,
                  uriRequest,
                  logger
              )
            : undefined;
        const dependencies = await project.listDependencies(all, registry);
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
        all: new Opt("Include transitive dependencies", { isFlag: true }),
    },
    chainable: true,
});

export default cmd;
