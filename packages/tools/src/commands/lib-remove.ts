import { stderr, stdout } from "process";
import { Arg, Command, Opt } from "./lib/command.js";
import fs from "fs";
import { Project } from "@jaculus/project";
import { uriRequest } from "../util.js";

const cmd = new Command("Remove a library from the project package.json", {
    action: async (options: Record<string, string | boolean>, args: Record<string, string>) => {
        const libraryName = args["library"] as string;
        const projectPath = (options["path"] as string) || "./";

        const project = new Project(fs, projectPath, stdout, stderr, uriRequest);
        await project.removeLibrary(libraryName);
    },
    args: [new Arg("library", "Library to remove from the project", { required: true })],
    options: {
        path: new Opt("Project directory path", { defaultValue: "./" }),
    },
    chainable: true,
});

export default cmd;
