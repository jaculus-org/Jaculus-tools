import { Arg, Opt, Command, Env } from "./lib/command.js";
import { stdout, stderr } from "process";
import { getDevice, readPassword } from "./util.js";
import { WifiMode, WifiStaMode } from "@jaculus/device";

export const wifiAdd = new Command("Add a WiFi network", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const ssid = args["ssid"] as string;

        const password = await readPassword("Password: ");

        const device = await getDevice(port, baudrate, socket, env);

        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        await device.controller.addWifiNetwork(ssid, password);

        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });

        stdout.write("Network added\n");
    },
    args: [new Arg("ssid", "SSID (name) of the network", { required: true })],
    chainable: true,
});

export const wifiRemove = new Command("Remove a WiFi network", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const ssid = args["ssid"] as string;

        const device = await getDevice(port, baudrate, socket, env);

        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        await device.controller.removeWifiNetwork(ssid);

        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });

        stdout.write("Network removed\n");
    },
    args: [new Arg("ssid", "SSID (name) of the network", { required: true })],
    chainable: true,
});

export const wifiGet = new Command("Display current WiFi config", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const watch = options["watch"] as boolean;

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

            const mode = await device.controller.getWifiMode();
            const staMode = await device.controller.getWifiStaMode();
            const staSpecific = await device.controller.getWifiStaSpecific();
            const apSsid = await device.controller.getWifiApSsid();
            const currentIp = await device.controller.getCurrentWifiIp();

            stdout.write(`Current IP: ${currentIp}

WiFi Mode: ${WifiMode[mode]}

Station Mode: ${WifiStaMode[staMode]}
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
        watch: new Opt("Watch for changes", { isFlag: true }),
    },
    chainable: true,
});

export const wifiDisable = new Command("Disable WiFi", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const device = await getDevice(port, baudrate, socket, env);

        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        await device.controller.setWifiMode(WifiMode.DISABLED);

        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });

        stdout.write("Wifi config changed.\n");
    },
    chainable: true,
});

export const wifiSetAp = new Command("Set WiFi to AP mode (create a hotspot)", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;

        const ssid = args["ssid"] as string | undefined;
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

        await device.controller.setWifiMode(WifiMode.AP);
        if (ssid !== undefined) {
            await device.controller.setWifiApSsid(ssid);
        }
        if (pass !== undefined) {
            await device.controller.setWifiApPassword(pass);
        }

        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });

        stdout.write("Wifi config changed.\n");
    },
    args: [new Arg("ssid", "SSID (name) of the network", { required: true })],
    chainable: true,
});

export const wifiSetSta = new Command("Set WiFi to Station mode (connect to a wifi)", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;

        const specificSsid = options["specific"] as string | undefined;
        const noApFallback = options["no-ap-fallback"] as boolean;

        if (specificSsid && specificSsid.length >= 31) {
            stderr.write("SSID is too long\n");
            throw 1;
        }

        const device = await getDevice(port, baudrate, socket, env);
        await device.controller.lock().catch((err) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        await device.controller.setWifiMode(WifiMode.STATION);

        if (!specificSsid) {
            await device.controller.setWifiStaMode(WifiStaMode.BEST_SIGNAL);
        } else {
            await device.controller.setWifiStaMode(WifiStaMode.SPECIFIC_SSID);
            await device.controller.setWifiStaSpecific(specificSsid);
        }

        await device.controller.setWifiStaApFallback(!noApFallback);

        await device.controller.unlock().catch((err) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });

        stdout.write("Wifi config changed.\n");
    },
    options: {
        specific: new Opt(
            "SSID (name) of a wifi network to connect to. It must be added using wifi-add first. If specified, this network will be used exclusively, without scanning."
        ),
        "no-ap-fallback": new Opt("Disable AP fallback when no known network is found.", {
            isFlag: true,
        }),
    },
    args: [],
    chainable: true,
});
