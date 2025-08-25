import { Program } from "./lib/command.js";

// import & re-export “util” so apps can use getDevice()
export * from "./util.js";

// Register all reusable commands (everything except “version”)
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
import monitor from "./monitor.js";
import pull from "./pull.js";
import formatCmd from "./format.js";
import resourcesLs from "./resources-ls.js";
import resourcesRead from "./resources-read.js";
import { wifiAdd, wifiRemove, wifiGet, wifiSetAp, wifiSetSta, wifiDisable } from "./wifi.js";
import { projectCreate, projectUpdate } from "./project.js";

export function registerJaculusCommands(jac: Program) {
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
    jac.addCommand("format", formatCmd);
    jac.addCommand("project-create", projectCreate);
    jac.addCommand("project-update", projectUpdate);
    jac.addCommand("resources-ls", resourcesLs);
    jac.addCommand("resources-read", resourcesRead);
    jac.addCommand("start", start);
    jac.addCommand("stop", stop);
    jac.addCommand("status", status);
    jac.addCommand("monitor", monitor);
    jac.addCommand("wifi-get", wifiGet);
    jac.addCommand("wifi-ap", wifiSetAp);
    jac.addCommand("wifi-add", wifiAdd);
    jac.addCommand("wifi-rm", wifiRemove);
    jac.addCommand("wifi-sta", wifiSetSta);
    jac.addCommand("wifi-disable", wifiDisable);
}
