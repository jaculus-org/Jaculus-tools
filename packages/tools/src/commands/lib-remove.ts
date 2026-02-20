import { stderr, stdout } from "process";
import { Arg, Command, Opt } from "./lib/command.js";
import fs from "fs";
import { uriRequest } from "../util.js";
import path from "path";
import { loadPackageJson } from "@jaculus/project/package";
import { Project } from "@jaculus/project";
import { Registry } from "@jaculus/project/registry";

const cmd = new Command("Remove a library from the project package.json", {
    action: async (options: Record<string, string | boolean>, args: Record<string, string>) => {
        const libraryName = args["library"] as string;
        const projectPath = options["path"] as string;

        const pkg = await loadPackageJson(fs, path.join(projectPath, "package.json"));
        const registry = await Registry.create(pkg?.registry, uriRequest);
        const project = new Project(fs, projectPath, stdout, stderr, registry);
        await project.removeLibrary(libraryName);
    },
    args: [new Arg("library", "Library name to remove from the project", { required: true })],
    options: {
        path: new Opt("Project directory path", { defaultValue: "./" }),
    },
    chainable: true,
});

export default cmd;
