import { Arg, Opt, Command } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice, readPassword } from "./util.js";
var WifiKvNs;
(function (WifiKvNs) {
    WifiKvNs["Ssids"] = "wifi_net";
    WifiKvNs["Main"] = "wifi_cfg";
})(WifiKvNs || (WifiKvNs = {}));
var WifiKeys;
(function (WifiKeys) {
    WifiKeys["Mode"] = "mode";
    WifiKeys["StaMode"] = "sta_mode";
    WifiKeys["StaSpecific"] = "sta_ssid";
    WifiKeys["StaApFallback"] = "sta_ap_fallback";
    WifiKeys["ApSsid"] = "ap_ssid";
    WifiKeys["ApPass"] = "ap_pass";
    WifiKeys["CurrentIp"] = "current_ip";
})(WifiKeys || (WifiKeys = {}));
var WifiMode;
(function (WifiMode) {
    WifiMode[WifiMode["DISABLED"] = 0] = "DISABLED";
    WifiMode[WifiMode["STATION"] = 1] = "STATION";
    WifiMode[WifiMode["AP"] = 2] = "AP";
})(WifiMode || (WifiMode = {}));
var StaMode;
(function (StaMode) {
    // Connect to any known network, pick the one with better signal if multiple found
    StaMode[StaMode["BEST_SIGNAL"] = 0] = "BEST_SIGNAL";
    // Connect to SSID specified in sta_ssid only
    StaMode[StaMode["SPECIFIC_SSID"] = 1] = "SPECIFIC_SSID";
})(StaMode || (StaMode = {}));
export const wifiAdd = new Command("Add a WiFi network", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
        const ssid = args["ssid"];
        const password = await readPassword("Password: ");
        const device = await getDevice(port, baudrate, socket, env);
        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });
        await device.controller.configSetString("wifi_net", ssid.substring(0, 15), password);
        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
        stdout.write("Network added\n");
    },
    args: [
        new Arg("ssid", "SSID (name) of the network", { required: true }),
    ],
    chainable: true
});
export const wifiRemove = new Command("Remove a WiFi network", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
        const ssid = args["ssid"];
        const device = await getDevice(port, baudrate, socket, env);
        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });
        await device.controller.configErase("wifi_net", ssid);
        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
        stdout.write("Network removed\n");
    },
    args: [
        new Arg("ssid", "SSID (name) of the network", { required: true }),
    ],
    chainable: true
});
export const wifiGet = new Command("Display current WiFi config", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
        const watch = options["watch"];
        const device = await getDevice(port, baudrate, socket, env);
        let first = true;
        do {
            if (!first) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                stdout.write("\n-----\n");
            }
            first = false;
            await device.controller.lock().catch((err) => {
                stderr.write("Error locking device: " + err + "\n");
                throw 1;
            });
            const mode = await device.controller.configGetInt(WifiKvNs.Main, WifiKeys.Mode);
            const staMode = await device.controller.configGetInt(WifiKvNs.Main, WifiKeys.StaMode);
            const staSpecific = await device.controller.configGetString(WifiKvNs.Main, WifiKeys.StaSpecific);
            const apSsid = await device.controller.configGetString(WifiKvNs.Main, WifiKeys.ApSsid);
            const currentIp = await device.controller.configGetString(WifiKvNs.Main, WifiKeys.CurrentIp);
            stdout.write(`Current IP: ${currentIp}

WiFi Mode: ${WifiMode[mode]}

Station Mode: ${StaMode[staMode]}
Station Specific SSID: ${staSpecific}

AP SSID: ${apSsid}
`);
            await device.controller.unlock().catch((err) => {
                stderr.write("Error unlocking device: " + err + "\n");
                throw 1;
            });
        } while (watch);
    },
    options: {
        "watch": new Opt("Watch for changes", { isFlag: true }),
    },
    chainable: true
});
export const wifiDisable = new Command("Disable WiFi", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
        const device = await getDevice(port, baudrate, socket, env);
        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });
        await device.controller.configSetInt(WifiKvNs.Main, WifiKeys.Mode, WifiMode.DISABLED);
        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
        stdout.write("Wifi config changed.\n");
    },
    chainable: true
});
export const wifiSetAp = new Command("Set WiFi to AP mode (create a hotspot)", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
        const ssid = args["ssid"];
        const pass = await readPassword("Password: ");
        if (ssid && ssid.length >= 31) {
            stderr.write("SSID is too long\n");
            throw 1;
        }
        if (pass && pass.length >= 63) {
            stderr.write("Password is too long\n");
            throw 1;
        }
        const device = await getDevice(port, baudrate, socket, env);
        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });
        await device.controller.configSetInt(WifiKvNs.Main, WifiKeys.Mode, WifiMode.AP);
        if (ssid !== undefined) {
            await device.controller.configSetString(WifiKvNs.Main, WifiKeys.ApSsid, ssid);
        }
        if (pass !== undefined) {
            await device.controller.configSetString(WifiKvNs.Main, WifiKeys.ApPass, pass);
        }
        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
        stdout.write("Wifi config changed.\n");
    },
    args: [
        new Arg("ssid", "SSID (name) of the network", { required: true }),
    ],
    chainable: true
});
export const wifiSetSta = new Command("Set WiFi to Station mode (connect to a wifi)", {
    action: async (options, args, env) => {
        const port = options["port"];
        const baudrate = options["baudrate"];
        const socket = options["socket"];
        const specificSsid = options["specific"];
        const noApFallback = options["no-ap-fallback"];
        if (specificSsid && specificSsid.length >= 31) {
            stderr.write("SSID is too long\n");
            throw 1;
        }
        const device = await getDevice(port, baudrate, socket, env);
        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });
        await device.controller.configSetInt(WifiKvNs.Main, WifiKeys.Mode, WifiMode.STATION);
        if (!specificSsid) {
            await device.controller.configSetInt(WifiKvNs.Main, WifiKeys.StaMode, StaMode.BEST_SIGNAL);
        }
        else {
            await device.controller.configSetInt(WifiKvNs.Main, WifiKeys.StaMode, specificSsid ? StaMode.SPECIFIC_SSID : StaMode.BEST_SIGNAL);
            await device.controller.configSetString(WifiKvNs.Main, WifiKeys.StaSpecific, specificSsid);
        }
        await device.controller.configSetInt(WifiKvNs.Main, WifiKeys.StaApFallback, !noApFallback ? 1 : 0);
        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
        stdout.write("Wifi config changed.\n");
    },
    options: {
        "specific": new Opt("SSID (name) of a wifi network to connect to. It must be added using wifi-add first. If specified, this network will be used exclusively, without scanning."),
        "no-ap-fallback": new Opt("Disable AP fallback when no known network is found.", { isFlag: true })
    },
    args: [],
    chainable: true
});
//# sourceMappingURL=wifi.js.map