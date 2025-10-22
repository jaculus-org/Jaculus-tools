import path from "path";
import { Writable } from "stream";
import { FSInterface } from "../fs/index.js";

export interface ProjectPackage {
    dirs: string[];
    files: Record<string, Uint8Array>;
}

export async function unpackPackage(
    fs: FSInterface,
    outPath: string,
    pkg: ProjectPackage,
    filter: (fileName: string) => boolean,
    err: Writable,
    dryRun: boolean = false
): Promise<void> {
    for (const dir of pkg.dirs) {
        const source = dir;
        const fullPath = path.join(outPath, source);
        if (!fs.existsSync(fullPath) && !dryRun) {
            err.write(`Create directory: ${fullPath}\n`);
            await fs.promises.mkdir(fullPath, { recursive: true });
        }
    }

    for (const [fileName, data] of Object.entries(pkg.files)) {
        const source = fileName;

        if (!filter(source)) {
            err.write(`Skip file: ${source}\n`);
            continue;
        }
        const fullPath = path.join(outPath, source);

        err.write(`${fs.existsSync(fullPath) ? "Overwrite" : "Create"} file: ${fullPath}\n`);
        if (!dryRun) {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            await fs.promises.writeFile(fullPath, data);
        }
    }
}

export async function createProject(
    fs: FSInterface,
    outPath: string,
    pkg: ProjectPackage,
    err: Writable,
    dryRun: boolean = false
): Promise<void> {
    if (fs.existsSync(outPath)) {
        err.write(`Directory '${outPath}' already exists\n`);
        throw 1;
    }

    const filter = (fileName: string): boolean => {
        if (fileName === "manifest.json") {
            return false;
        }
        return true;
    };

    await unpackPackage(fs, outPath, pkg, filter, err, dryRun);
}

export async function updateProject(
    fs: FSInterface,
    outPath: string,
    pkg: ProjectPackage,
    err: Writable,
    dryRun: boolean = false
): Promise<void> {
    if (!fs.existsSync(outPath)) {
        err.write(`Directory '${outPath}' does not exist\n`);
        throw 1;
    }

    if (!fs.statSync(outPath).isDirectory()) {
        err.write(`Path '${outPath}' is not a directory\n`);
        throw 1;
    }

    let manifest;
    if (pkg.files["manifest.json"]) {
        manifest = JSON.parse(new TextDecoder().decode(pkg.files["manifest.json"]));
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
                err.write(`Invalid skeleton entry: ${JSON.stringify(entry)}\n`);
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

    await unpackPackage(fs, outPath, pkg, filter, err, dryRun);
}
