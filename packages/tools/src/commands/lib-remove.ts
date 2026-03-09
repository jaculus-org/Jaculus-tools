import { stdout } from "process";
import { Arg, Command } from "./lib/command.js";
import fs from "fs";
import { uriRequest } from "../util.js";
import path from "path";
import { loadPackageJson } from "@jaculus/project/package";
import { Project } from "@jaculus/project";
import { Registry } from "@jaculus/project/registry";
import { logger } from "../logger.js";

const cmd = new Command("Remove a library from the project package.json", {
    action: async (_options: Record<string, string | boolean>, args: Record<string, string>) => {
        const libraryName = args["library"] as string;
        const projectPath = process.cwd();

        const pkg = await loadPackageJson(fs, path.join(projectPath, "package.json"));
        const project = new Project(fs, projectPath, stdout, logger);
        const registry = await Registry.create(pkg.registry, uriRequest);
        await project.removeLibrary(registry, libraryName);
    },
    args: [new Arg("library", "Library name to remove from the project", { required: true })],
    chainable: true,
});

export default cmd;
