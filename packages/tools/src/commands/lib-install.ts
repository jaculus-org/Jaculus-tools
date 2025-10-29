import { stderr, stdout } from "process";
import { Command, Opt } from "./lib/command.js";
import fs from "fs";
import { Project } from "@jaculus/project";
import { uriRequest } from "../util.js";

const cmd = new Command("Install Jaculus libraries base on project's package.json", {
    action: async (options: Record<string, string | boolean>) => {
        const projectPath = (options["path"] as string) || "./";

        const project = new Project(fs, projectPath, stdout, stderr, uriRequest);
        await project.install();
    },
    options: {
        path: new Opt("Project directory path", { defaultValue: "./" }),
    },
    chainable: true,
});

export default cmd;
