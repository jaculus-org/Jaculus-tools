import { Writable } from "stream";
import { FSInterface } from "./fs.js";
import { ProjectError, ProjectPackage } from "./project.js";
import path from "path";
import { Logger } from "../../common/dist/logger.js";

export async function unpackPackage(
    fs: FSInterface,
    projectPath: string,
    pkg: ProjectPackage,
    filter: (fileName: string) => boolean,
    out: Writable,
    logger: Logger,
    dryRun: boolean = false
): Promise<void> {
    for (const dir of pkg.dirs) {
        const source = dir;
        const fullPath = path.join(projectPath, source);
        if (!fs.existsSync(fullPath) && !dryRun) {
            logger.info(`Create directory: ${fullPath}`);
            await fs.promises.mkdir(fullPath, { recursive: true });
        }
    }

    for (const [fileName, data] of Object.entries(pkg.files)) {
        const source = fileName;

        if (!filter(source)) {
            out.write(`[skip] ${source}\n`);
            continue;
        }
        const fullPath = path.join(projectPath, source);

        const exists = fs.existsSync(fullPath);
        out.write(`${dryRun ? "[dry-run] " : ""}${exists ? "Overwrite" : "Create"} ${fullPath}\n`);

        if (!dryRun) {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            await fs.promises.writeFile(fullPath, data);
        }
    }
}

export async function createFromPackage(
    fs: FSInterface,
    projectPath: string,
    pkg: ProjectPackage,
    out: Writable,
    logger: Logger,
    dryRun: boolean = false,
    validateFolder: boolean = true
): Promise<void> {
    if (validateFolder && !dryRun && fs.existsSync(projectPath)) {
        throw new ProjectError(`Directory '${projectPath}' already exists`);
    }

    const filter = (fileName: string): boolean => {
        if (fileName === "manifest.json") {
            return false;
        }
        return true;
    };

    await unpackPackage(fs, projectPath, pkg, filter, out, logger, dryRun);
}

export async function updateFromPackage(
    fs: FSInterface,
    projectPath: string,
    pkg: ProjectPackage,
    out: Writable,
    logger: Logger,
    dryRun: boolean = false
): Promise<void> {
    if (!fs.existsSync(projectPath)) {
        throw new ProjectError(`Directory '${projectPath}' does not exist`);
    }

    if (!fs.statSync(projectPath).isDirectory()) {
        throw new ProjectError(`Path '${projectPath}' is not a directory`);
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
                throw new ProjectError(`Invalid skeleton entry: ${JSON.stringify(entry)}`);
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

    await unpackPackage(fs, projectPath, pkg, filter, out, logger, dryRun);
}
