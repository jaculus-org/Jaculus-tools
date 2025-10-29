import { stderr, stdout } from "process";
import { Arg, Command, Opt } from "./lib/command.js";
import fs from "fs";
import { Project } from "@jaculus/project";
import { uriRequest } from "../util.js";

const cmd = new Command("Add a library to the project package.json", {
    action: async (options: Record<string, string | boolean>, args: Record<string, string>) => {
        const libraryName = args["library"] as string;
        const projectPath = (options["path"] as string) || "./";

        const project = new Project(fs, projectPath, stdout, stderr, uriRequest);

        const [name, version] = libraryName.split("@");
        if (version) {
            await project.addLibraryVersion(name, version);
        } else {
            await project.addLibrary(name);
        }
    },
    args: [
        new Arg(
            "library",
            "Library to add to the project (name@version) like led@1.0.0, if no version is specified, the latest version will be used",
            { required: true }
        ),
    ],
    options: {
        path: new Opt("Project directory path", { defaultValue: "./" }),
    },
    chainable: true,
});

export default cmd;
