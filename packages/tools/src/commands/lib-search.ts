import { stdout } from "process";
import { Arg, Command, Opt } from "./lib/command.js";
import fs from "fs";
import path from "path";
import { loadPackageJson } from "@jaculus/project/package";
import { Registry } from "@jaculus/project/registry";
import { uriRequest } from "../util.js";

const cmd = new Command("Search libraries in configured registries", {
    action: async (options: Record<string, string | boolean>, args: Record<string, string>) => {
        const query = ((args["query"] as string | undefined) ?? "").trim();
        const allLibs = options["all-libs"] as boolean;

        const pkg = await loadPackageJson(fs, path.join(process.cwd(), "package.json"));
        const registry = await Registry.create(pkg?.registry, uriRequest);

        const libraries = await registry.listPackages();
        const matches = allLibs
            ? [...libraries].sort((a, b) => a.localeCompare(b))
            : libraries
                  .filter((library) => library.toLowerCase().includes(query.toLowerCase()))
                  .sort((a, b) => a.localeCompare(b));

        if (!allLibs && query.length === 0) {
            throw new Error('Query is required unless "--all-libs" is used');
        }

        if (matches.length === 0) {
            const scope = allLibs ? "in configured registries" : `for "${query}"`;
            stdout.write(`No registry libraries found ${scope}.\n`);
            return;
        }

        stdout.write(`${allLibs ? "All libraries:" : "Matching libraries:"}\n`);
        for (const library of matches) {
            stdout.write(`${library}\n`);
        }
    },
    args: [new Arg("query", "Library search query")],
    options: {
        "all-libs": new Opt("List all libraries from all configured registries", { isFlag: true }),
    },
    chainable: true,
});

export default cmd;
