#!/usr/bin/env node
import { stdout, stderr } from "process";
import { Program, Command, Opt, Arg } from "./commands/lib/command.js";
import { registerJaculusCommands } from "./commands/index.js";
import { logger } from "./logger.js";

const jac = new Program("jac", "Tools for controlling devices running Jaculus", {
    globalOptions: {
        "log-level": new Opt("Set log level", { defaultValue: "info" }),
        port: new Opt("Serial port to use (default: first available)"),
        baudrate: new Opt("Baudrate to use", { defaultValue: "921600" }),
        socket: new Opt("host:port to use"),
    },
    action: async (options: Record<string, string | boolean>) => {
        logger.level = options["log-level"] as string;
    },
});

// Help command
jac.addCommand(
    "help",
    new Command("Print help for given command or subcommand", {
        action: async (options: Record<string, string | boolean>, args: Record<string, string>) => {
            const command = args["command"];
            const subcommand = args["subcommand"];
            if (command) {
                const cmd = jac.getCommand(command);
                if (cmd) {
                    if (subcommand) {
                        const subcmd = cmd.getSubcommand(subcommand);
                        if (subcmd) {
                            stdout.write(subcmd.help(`${command} ${subcommand}`) + "\n");
                        } else {
                            stdout.write(`Unknown subcommand: ${subcommand}` + "\n");
                        }
                    } else {
                        stdout.write(cmd.help(command) + "\n");
                    }
                } else {
                    stdout.write(`Unknown command: ${command}` + "\n");
                }
            } else {
                stdout.write(jac.help() + "\n");
            }
        },
        args: [
            new Arg("command", "The command to get help for", { required: false }),
            new Arg("subcommand", "The subcommand to get help for", { required: false }),
        ],
    })
);

registerJaculusCommands(jac);

const args = process.argv.slice(2);
if (args.length === 0) {
    args.push("help");
}

jac.run(args)
    .then((result) => {
        jac.end();

        if (result.type === "help") {
            stdout.write(result.text + "\n");
            process.exit(0);
        }

        if (result.type === "exit") {
            process.exit(result.code);
        }

        // type === "continue"
        stderr.write("\nDone\n");
        process.exit(0);
    })
    .catch((e) => {
        jac.end();
        if (typeof e === "number") {
            process.exit(e);
        }
        if (e instanceof Error) {
            console.error(e.message);
            process.exit(1);
        }
        console.error(e);
        process.exit(1);
    });
