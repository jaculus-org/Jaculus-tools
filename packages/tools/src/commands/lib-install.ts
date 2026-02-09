import { stderr, stdout } from "process";
import { Arg, Command, Opt } from "./lib/command.js";
import fs from "fs";
import { loadPackageJson, Project, Registry, splitLibraryNameVersion } from "@jaculus/project";
import { uriRequest } from "../util.js";
import path from "path";

const cmd = new Command("Install Jaculus libraries base on project's package.json", {
    action: async (options: Record<string, string | boolean>, args: Record<string, string>) => {
        const libraryName = args["library"] as string;
        const projectPath = options["path"] as string;

        const pkg = await loadPackageJson(fs, path.join(projectPath, "package.json"));
        const registry = await Registry.create(pkg?.registry || [], uriRequest);
        const project = new Project(fs, projectPath, stdout, stderr, registry);

        const { name, version } = splitLibraryNameVersion(libraryName);
        if (name && version) {
            await project.addLibraryVersion(name, version);
        } else if (name) {
            await project.addLibrary(name);
        }
        await project.install();
    },
    args: [
        new Arg(
            "library",
            "Library to add to the project (name@version) like led@1.0.0, if no version is specified, the latest version will be used",
            { defaultValue: "" }
        ),
    ],
    options: {
        path: new Opt("Project directory path", { defaultValue: "./" }),
    },
    chainable: true,
});

export default cmd;
