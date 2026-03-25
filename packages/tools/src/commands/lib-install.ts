import { Arg, Command, Opt } from "./lib/command.js";
import fs from "fs";
import { uriRequest } from "../util.js";
import path from "path";
import { loadPackageJson, splitLibraryNameVersion } from "@jaculus/project/package";
import { Project } from "@jaculus/project";
import { Registry } from "@jaculus/project/registry";
import { logger } from "../logger.js";

const cmd = new Command("Install Jaculus libraries base on project's package.json", {
    action: async (options: Record<string, string | boolean>, args: Record<string, string>) => {
        const libraryName = args["library"] as string;
        const devRegistry = options["dev-registry"] as string | undefined;
        const projectPath = process.cwd();

        const pkg = await loadPackageJson(fs, path.join(projectPath, "package.json"));
        const project = new Project(fs, projectPath, logger);

        console.log("Using registry:", devRegistry);

        const registry = new Registry(pkg.jaculus?.registry, uriRequest, logger, devRegistry);

        const { name, version } = splitLibraryNameVersion(libraryName);
        if (name && version) {
            await project.addLibraryVersion(registry, name, version);
        } else if (name) {
            await project.addLibrary(registry, name);
        } else {
            await project.install(registry);
        }
    },
    args: [
        new Arg(
            "library",
            "Library to add to the project (name@version) like led@1.0.0, if no version is specified, the latest version will be used",
            { defaultValue: "" }
        ),
    ],
    options: {
        "dev-registry": new Opt(`Force to use development registry (provided URI)`, {
            required: false,
        }),
    },
    chainable: true,
});

export default cmd;
