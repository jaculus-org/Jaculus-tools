import { stderr, stdout } from "process";
import { Arg, Command, Opt } from "./lib/command.js";
import fs from "fs";
import { loadPackageJson, Project, Registry } from "@jaculus/project";
import { uriRequest } from "../util.js";
import path from "path/win32";

const cmd = new Command("Remove a library from the project package.json", {
    action: async (options: Record<string, string | boolean>, args: Record<string, string>) => {
        const libraryName = args["library"] as string;
        const projectPath = options["path"] as string;

        const pkg = await loadPackageJson(fs, path.join(projectPath, "package.json"));
        const registry = await Registry.create(pkg.registry, uriRequest);
        const project = new Project(fs, projectPath, stdout, stderr, registry);
        await project.removeLibrary(libraryName);
        await project.install();
    },
    args: [new Arg("library", "Library to remove from the project", { required: true })],
    options: {
        path: new Opt("Project directory path", { defaultValue: "./" }),
    },
    chainable: true,
});

export default cmd;
