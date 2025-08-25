#!/usr/bin/env node
import { Program, Command, Opt } from "./commands/lib/command.js";
import { registerJaculusCommands } from "./commands/index.js";
import { logger } from "./logger.js";
import { stdout, stderr } from "process";
import versionCommand from "./commands/version.js";

const jac = new Program("jac", "Tools for controlling devices running Jaculus", {
    globalOptions: {
        "log-level": new Opt("Set log level", { defaultValue: "info" }),
        help: new Opt("Print this help message", { isFlag: true }),
        port: new Opt("Serial port to use (default: first available)"),
        baudrate: new Opt("Baudrate to use", { defaultValue: "921600" }),
        socket: new Opt("host:port to use"),
    },
    action: async (options: Record<string, string | boolean>) => {
        if (options["help"]) {
            stdout.write(jac.help() + "\n");
            throw 0;
        }
        logger.level = options["log-level"] as string;
    },
});

// Help command
jac.addCommand(
    "help",
    new Command("Print help for given command", {
        action: async (options, args) => {
            const command = args["command"];
            if (command) {
                const cmd = jac.getCommand(command);
                stdout.write((cmd ? cmd.help(command) : `Unknown command: ${command}`) + "\n");
            } else {
                stdout.write(jac.help() + "\n");
            }
        },
    })
);

// Reusable command set from package
registerJaculusCommands(jac);

// App-specific `version`
jac.addCommand("version", versionCommand);

const args = process.argv.slice(2);
if (args.length === 0) args.push("help");

jac.run(args)
    .then(() => {
        jac.end();
        stderr.write("\nDone\n");
        process.exit(0);
    })
    .catch((e) => {
        jac.end();
        if (typeof e === "number") process.exit(e);
        if (e instanceof Error) {
            console.error(e.message);
            process.exit(1);
        }
        console.error(e);
        process.exit(1);
    });
