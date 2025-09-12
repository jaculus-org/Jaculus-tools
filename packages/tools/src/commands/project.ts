import { Arg, Command, Env, Opt } from "./lib/command.js";
import { stderr } from "process";
import { getDevice } from "./util.js";
import fs from "fs";
import * as tar from "tar-stream";
import pako from "pako";
import path from "path";
import { getUri } from "get-uri";
import { JacDevice } from "@jaculus/device";

interface Package {
    dirs: string[];
    files: Record<string, Buffer>;
}

async function loadFromDevice(device: JacDevice): Promise<Buffer> {
    await device.controller.lock().catch((err) => {
        stderr.write("Error locking device: " + err + "\n");
        throw 1;
    });

    const data = await device.uploader.readResource("ts-examples").catch((err) => {
        stderr.write("Error: " + err + "\n");
        throw 1;
    });

    await device.controller.unlock().catch((err) => {
        stderr.write("Error unlocking device: " + err + "\n");
        throw 1;
    });

    return data;
}

async function loadPackage(options: Record<string, string | boolean>, env: Env): Promise<Package> {
    const pkgUri = options["package"] as string;
    const fromDevice = options["from-device"] as boolean;

    if (fromDevice && pkgUri) {
        stderr.write("Cannot specify both --from-device and --package options\n");
        throw 1;
    }
    if (!fromDevice && !pkgUri) {
        stderr.write("Either --from-device or --package option must be specified\n");
        throw 1;
    }

    let source: { uri?: string; device?: JacDevice };

    if (fromDevice) {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;

        const device = await getDevice(port, baudrate, socket, env);
        source = { device };
    } else {
        source = { uri: pkgUri };
    }

    const dirs: string[] = [];
    const files: Record<string, Buffer> = {};

    const extract = tar.extract();

    if (source.uri) {
        const stream = await getUri(source.uri);

        await new Promise((resolve, reject) => {
            const inflator = new pako.Inflate();
            inflator.onData = (chunk) => {
                const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
                extract.write(u8);
            };
            inflator.onEnd = (status) => {
                if (status !== 0) {
                    reject(new Error("Failed to decompress package"));
                    return;
                }
                extract.end();
                resolve(null);
            };
            stream.on("data", (chunk: Buffer) => {
                inflator.push(chunk, false);
            });
            stream.on("end", () => {
                inflator.push(new Uint8Array(0), true);
            });
        });
    } else if (source.device) {
        const buffer = await loadFromDevice(source.device);
        const res = pako.ungzip(buffer);
        extract.write(Buffer.from(res));
        extract.end();
    } else {
        stderr.write("Invalid source for package");
        throw 1;
    }

    await new Promise((resolve, reject) => {
        extract.on("entry", (header, stream, next) => {
            if (header.type === "directory") {
                dirs.push(header.name);
                next();
                return;
            }
            if (header.type !== "file") {
                next();
                return;
            }

            const chunks: Buffer[] = [];
            stream.on("data", (chunk) => {
                chunks.push(chunk);
            });
            stream.on("end", () => {
                const data = Buffer.concat(chunks);
                files[path.normalize(header.name)] = data;

                next();
            });
            stream.on("error", (err) => {
                reject(err);
            });
        });
        extract.on("finish", () => {
            resolve(null);
        });
        extract.on("error", (err) => {
            reject(err);
        });
    });

    return { dirs, files };
}

function unpackPackage(
    pkg: Package,
    outPath: string,
    filter: (fileName: string) => boolean,
    dryRun: boolean = false
): void {
    for (const dir of pkg.dirs) {
        const source = dir;
        const fullPath = path.join(outPath, source);
        if (!fs.existsSync(fullPath) && !dryRun) {
            console.log(`Create directory: ${fullPath}`);
            fs.mkdirSync(fullPath, { recursive: true });
        }
    }

    for (const [fileName, data] of Object.entries(pkg.files)) {
        const source = fileName;

        if (!filter(source)) {
            console.log(`Skip file: ${source}`);
            continue;
        }
        const fullPath = path.join(outPath, source);

        console.log(`${fs.existsSync(fullPath) ? "Overwrite" : "Create"} file: ${fullPath}`);
        if (!dryRun) {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, data);
        }
    }
}

export const projectCreate = new Command("Create project from package", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const outPath = args["path"] as string;
        const dryRun = options["dry-run"] as boolean;

        if (fs.existsSync(outPath)) {
            stderr.write(`Directory '${outPath}' already exists\n`);
            throw 1;
        }

        const pkg = await loadPackage(options, env);

        const filter = (fileName: string): boolean => {
            if (fileName === "manifest.json") {
                return false;
            }
            return true;
        };

        unpackPackage(pkg, outPath, filter, dryRun);
    },
    options: {
        package: new Opt("Uri pointing to the package file"),
        "from-device": new Opt("Get package from device", { isFlag: true }),
        "dry-run": new Opt("Do not write files, just show what would be done", { isFlag: true }),
    },
    args: [new Arg("path", "Name of project directory", { required: true })],
    chainable: true,
});

export const projectUpdate = new Command("Update existing project from package skeleton", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const outPath = args["path"] as string;
        const dryRun = options["dry-run"] as boolean;

        if (!fs.existsSync(outPath)) {
            stderr.write(`Directory '${outPath}' does not exist\n`);
            throw 1;
        }

        if (!fs.statSync(outPath).isDirectory()) {
            stderr.write(`Path '${outPath}' is not a directory\n`);
            throw 1;
        }

        const pkg = await loadPackage(options, env);

        let manifest;
        if (pkg.files["manifest.json"]) {
            manifest = JSON.parse(pkg.files["manifest.json"].toString("utf-8"));
        }

        let skeleton: string[];
        if (!manifest || !manifest["skeletonFiles"]) {
            skeleton = ["@types/*", "tsconfig.json"];
        } else {
            const input = manifest["skeletonFiles"];
            skeleton = [];
            for (const entry of input) {
                if (typeof entry === "string") {
                    skeleton.push(entry);
                } else {
                    stderr.write(`Invalid skeleton entry: ${JSON.stringify(entry)}\n`);
                    throw 1;
                }
            }
        }

        const filter = (fileName: string): boolean => {
            if (fileName === "manifest.json") {
                return false;
            }
            for (const pattern of skeleton) {
                if (path.matchesGlob(fileName, pattern)) {
                    return true;
                }
            }
            return false;
        };

        unpackPackage(pkg, outPath, filter, dryRun);
    },
    options: {
        package: new Opt("Uri pointing to the package file"),
        "from-device": new Opt("Get package from device", { isFlag: true }),
        "dry-run": new Opt("Do not write files, just show what would be done", { isFlag: true }),
    },
    args: [new Arg("path", "Name of project directory", { required: true })],
    chainable: true,
});
