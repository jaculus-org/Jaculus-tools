import { Logger } from "@jaculus/common";
import { FSInterface } from "./fs.js";
import { ProjectError, ProjectBundle } from "./project.js";
import path from "path";

export async function unpackBundle(
    fs: FSInterface,
    projectPath: string,
    bundle: ProjectBundle,
    filter: (fileName: string) => boolean,
    logger: Logger,
    dryRun: boolean = false
): Promise<void> {
    for (const dir of bundle.dirs) {
        const source = dir;
        const fullPath = path.join(projectPath, source);
        if (!fs.existsSync(fullPath) && !dryRun) {
            logger.info(`Create directory: ${fullPath}`);
            await fs.promises.mkdir(fullPath, { recursive: true });
        }
    }

    for (const [fileName, data] of Object.entries(bundle.files)) {
        const source = fileName;

        if (!filter(source)) {
            logger.info(`[skip] ${source}`);
            continue;
        }
        const fullPath = path.join(projectPath, source);

        const exists = fs.existsSync(fullPath);
        logger.info(`${dryRun ? "[dry-run] " : ""}${exists ? "Overwrite" : "Create"} ${fullPath}`);

        if (!dryRun) {
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            await fs.promises.writeFile(fullPath, data);
        }
    }
}

export async function createFromBundle(
    fs: FSInterface,
    projectPath: string,
    bundle: ProjectBundle,
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

    await unpackBundle(fs, projectPath, bundle, filter, logger, dryRun);
}

export async function updateFromBundle(
    fs: FSInterface,
    projectPath: string,
    bundle: ProjectBundle,
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
    if (bundle.files["manifest.json"]) {
        manifest = JSON.parse(new TextDecoder().decode(bundle.files["manifest.json"]));
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

    await unpackBundle(fs, projectPath, bundle, filter, logger, dryRun);
}
