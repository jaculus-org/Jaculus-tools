import { Program, Command } from "./lib/command.js";

import listPorts from "./list-ports.js";
import serialSocket from "./serial-socket.js";
import install from "./install.js";
import build from "./build.js";
import flash from "./flash.js";
import libBuild from "./lib-build.js";
import libInstall from "./lib-install.js";
import libList from "./lib-list.js";
import libRemove from "./lib-remove.js";
import libSearch from "./lib-search.js";
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
import monitor from "./monitor.js";
import pull from "./pull.js";
import formatCmd from "./format.js";
import resourcesLs from "./resources-ls.js";
import resourcesRead from "./resources-read.js";
import { wifiAdd, wifiRemove, wifiGet, wifiSetAp, wifiSetSta, wifiDisable } from "./wifi.js";
import { projectCreate, projectUpdate } from "./project.js";
import versionCommand from "./version.js";

export function registerJaculusCommands(jac: Program) {
    jac.addCommand("version", versionCommand);
    jac.addCommand("list-ports", listPorts);
    jac.addCommand("install", install);

    jac.addCommand("build", build);

    jac.addCommand("flash", flash);

    jac.addCommand("lib-build", libBuild);
    jac.addCommand("lib-install", libInstall);
    jac.addCommand("lib-list", libList);
    jac.addCommand("lib-remove", libRemove);
    jac.addCommand("lib-search", libSearch);

    jac.addCommand("pull", pull);
    jac.addCommand("ls", ls);
    jac.addCommand("read", read);
    jac.addCommand("write", write);
    jac.addCommand("rm", rm);
    jac.addCommand("mkdir", mkdir);
    jac.addCommand("rmdir", rmdir);
    jac.addCommand("upload", upload);
    jac.addCommand("format", formatCmd);

    const projectCommand = new Command("Project management commands", {
        description: "Manage projects, create and update projects.",
        chainable: true,
        subcommands: {
            create: projectCreate,
            update: projectUpdate,
        },
    });
    jac.addCommand("project", projectCommand);

    jac.addCommand("resources-ls", resourcesLs);
    jac.addCommand("resources-read", resourcesRead);

    jac.addCommand("start", start);
    jac.addCommand("stop", stop);
    jac.addCommand("status", status);
    jac.addCommand("monitor", monitor);

    const wifiCommand = new Command("WiFi configuration commands", {
        description:
            "Manage WiFi settings, configure networks, and switch between AP and Station modes.",
        chainable: true,
        subcommands: {
            get: wifiGet,
            ap: wifiSetAp,
            add: wifiAdd,
            rm: wifiRemove,
            sta: wifiSetSta,
            disable: wifiDisable,
        },
    });
    jac.addCommand("wifi", wifiCommand);

    jac.addCommand("serial-socket", serialSocket);
}
