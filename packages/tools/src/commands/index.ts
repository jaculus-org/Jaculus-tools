import { CommandLoader, Program } from "./lib/command.js";

function lazy(path: string, exportName = "default"): CommandLoader {
    return async () => (await import(path))[exportName];
}

export function registerJaculusCommands(jac: Program) {
    jac.addCommand("version", lazy("./version.js"));
    jac.addCommand("list-ports", lazy("./list-ports.js"));
    jac.addCommand("install", lazy("./install.js"));

    jac.addCommand("build", lazy("./build.js"));

    jac.addCommand("flash", lazy("./flash.js"));

    jac.addCommand("lib-build", lazy("./lib-build.js"));
    jac.addCommand("lib-install", lazy("./lib-install.js"));
    jac.addCommand("lib-list", lazy("./lib-list.js"));
    jac.addCommand("lib-remove", lazy("./lib-remove.js"));
    jac.addCommand("lib-search", lazy("./lib-search.js"));

    jac.addCommand("pull", lazy("./pull.js"));
    jac.addCommand("ls", lazy("./ls.js"));
    jac.addCommand("read", lazy("./read.js"));
    jac.addCommand("write", lazy("./write.js"));
    jac.addCommand("rm", lazy("./rm.js"));
    jac.addCommand("mkdir", lazy("./mkdir.js"));
    jac.addCommand("rmdir", lazy("./rmdir.js"));
    jac.addCommand("upload", lazy("./upload.js"));
    jac.addCommand("format", lazy("./format.js"));

    jac.addCommand("project-create", lazy("./project.js", "projectCreate"));
    jac.addCommand("project-update", lazy("./project.js", "projectUpdate"));
    jac.addCommand("resources-ls", lazy("./resources-ls.js"));
    jac.addCommand("resources-read", lazy("./resources-read.js"));

    jac.addCommand("start", lazy("./start.js"));
    jac.addCommand("stop", lazy("./stop.js"));
    jac.addCommand("status", lazy("./status.js"));
    jac.addCommand("monitor", lazy("./monitor.js"));

    jac.addCommand("wifi-get", lazy("./wifi.js", "wifiGet"));
    jac.addCommand("wifi-ls", lazy("./wifi.js", "wifiList"));
    jac.addCommand("wifi-ap", lazy("./wifi.js", "wifiSetAp"));
    jac.addCommand("wifi-add", lazy("./wifi.js", "wifiAdd"));
    jac.addCommand("wifi-rm", lazy("./wifi.js", "wifiRemove"));
    jac.addCommand("wifi-sta", lazy("./wifi.js", "wifiSetSta"));
    jac.addCommand("wifi-disable", lazy("./wifi.js", "wifiDisable"));

    jac.addCommand("serial-socket", lazy("./serial-socket.js"));
}
