import { stdout } from "process";
import { Command, Opt } from "./lib/command.js";
import fs from "fs";
import path from "path";
import { loadPackageJson } from "@jaculus/project/package";
import { Project } from "@jaculus/project";
import { Registry } from "@jaculus/project/registry";
import { uriRequest } from "../util.js";

const cmd = new Command("List libraries from project package.json", {
    action: async (options: Record<string, string | boolean>) => {
        const projectPath = options["path"] as string;
        const includeResolvedDependencies = options["resolved"] as boolean;

        const pkg = await loadPackageJson(fs, path.join(projectPath, "package.json"));
        const registry = includeResolvedDependencies
            ? await Registry.create(pkg?.registry, uriRequest)
            : undefined;
        const project = new Project(fs, projectPath, stdout, stdout, registry);

        const dependencies = await project.installedLibraries(includeResolvedDependencies);
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
        path: new Opt("Project directory path", { defaultValue: "./" }),
        resolved: new Opt("Include resolved transitive dependencies", { isFlag: true }),
    },
    chainable: true,
});

export default cmd;
