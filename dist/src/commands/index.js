#!/usr/bin/env node
import { Opt, Arg, Command, Program } from "./lib/command.js";
import { logger } from "../util/logger.js";
import { stdout, stderr } from "process";
const jac = new Program("jac", "Tools for controlling devices running Jaculus", {
    globalOptions: {
        "log-level": new Opt("Set log level", { defaultValue: "info" }),
        "help": new Opt("Print this help message", { isFlag: true }),
        "port": new Opt("Serial port to use (default: first available)"),
        "baudrate": new Opt("Baudrate to use", { defaultValue: "921600" }),
        "socket": new Opt("host:port to use"),
    },
    action: async (options) => {
        if (options["help"]) {
            stdout.write(jac.help() + "\n");
            throw 0;
        }
        logger.level = options["log-level"];
    }
});
jac.addCommand("help", new Command("Print help for given command", {
    action: async (options, args) => {
        const command = args["command"];
        if (command) {
            const cmd = jac.getCommand(command);
            if (cmd) {
                stdout.write(cmd.help(command) + "\n");
            }
            else {
                stdout.write(`Unknown command: ${command}` + "\n");
            }
        }
        else {
            stdout.write(jac.help() + "\n");
        }
    },
    args: [
        new Arg("command", "The command to get help for", { required: false }),
    ],
}));
import listPorts from "./list-ports.js";
import serialSocket from "./serial-socket.js";
import install from "./install.js";
import build from "./build.js";
import flash from "./flash.js";
import ls from "./ls.js";
import read from "./read.js";
import write from "./write.js";
import rm from "./rm.js";
import mkdir from "./mkdir.js";
import rmdir from "./rmdir.js";
import upload from "./upload.js";
import start from "./start.js";
import stop from "./stop.js";
import status from "./status.js";
import version from "./version.js";
import monitor from "./monitor.js";
import pull from "./pull.js";
import fomat from "./format.js";
import resourcesLs from "./resources-ls.js";
import resourcesRead from "./resources-read.js";
import { wifiAdd, wifiRemove, wifiGet, wifiSetAp, wifiSetSta, wifiDisable } from "./wifi.js";
import { projectCreate, projectUpdate } from "./project.js";
jac.addCommand("list-ports", listPorts);
jac.addCommand("serial-socket", serialSocket);
jac.addCommand("install", install);
jac.addCommand("build", build);
jac.addCommand("flash", flash);
jac.addCommand("pull", pull);
jac.addCommand("ls", ls);
jac.addCommand("read", read);
jac.addCommand("write", write);
jac.addCommand("rm", rm);
jac.addCommand("mkdir", mkdir);
jac.addCommand("rmdir", rmdir);
jac.addCommand("upload", upload);
jac.addCommand("format", fomat);
jac.addCommand("project-create", projectCreate);
jac.addCommand("project-update", projectUpdate);
jac.addCommand("resources-ls", resourcesLs);
jac.addCommand("resources-read", resourcesRead);
jac.addCommand("start", start);
jac.addCommand("stop", stop);
jac.addCommand("status", status);
jac.addCommand("version", version);
jac.addCommand("monitor", monitor);
jac.addCommand("wifi-get", wifiGet);
jac.addCommand("wifi-ap", wifiSetAp);
jac.addCommand("wifi-add", wifiAdd);
jac.addCommand("wifi-rm", wifiRemove);
jac.addCommand("wifi-sta", wifiSetSta);
jac.addCommand("wifi-disable", wifiDisable);
const args = process.argv.slice(2);
if (args.length === 0) {
    args.push("help");
}
jac.run(args).then(() => {
    jac.end();
    stderr.write("\nDone\n");
    process.exit(0);
}).catch((e) => {
    jac.end();
    if (typeof e === "number") {
        process.exit(e);
    }
    else if (e instanceof Error) {
        console.error(e.message);
        process.exit(1);
    }
    else {
        console.error(e);
        process.exit(1);
    }
});
//# sourceMappingURL=index.js.map