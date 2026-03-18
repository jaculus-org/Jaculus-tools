import { Command, Env, Opt } from "./lib/command.js";
import { stderr } from "process";
import { getDevice } from "./util.js";
import { logger } from "../logger.js";
import fs from "fs";
import { dirname } from "path";
import { Project } from "@jaculus/project";
import type { UploaderProgressCallback } from "@jaculus/device";
import cliProgress from "cli-progress";

async function ensureDirectoryExists(
    createDirectory: (path: string) => Promise<unknown>,
    dirPath: string,
    existingDirs: Set<string>
): Promise<void> {
    const parts = dirPath.split("/").filter(Boolean);
    let currentPath = "";

    for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (existingDirs.has(currentPath)) {
            continue;
        }

        await createDirectory(currentPath).catch((err: unknown) => {
            logger.verbose("Error creating directory: " + err);
            throw err;
        });
        existingDirs.add(currentPath);
    }
}

interface ProgressBarState {
    format: string;
    total: number;
    current: number;
    payload?: Record<string, string | number>;
}

class FlashProgressReporter {
    private bar?: cliProgress.SingleBar;
    private state?: Pick<ProgressBarState, "format" | "total">;

    private createBar(format: string) {
        return new cliProgress.SingleBar(
            {
                format,
                hideCursor: true,
                clearOnComplete: true,
            },
            cliProgress.Presets.rect
        );
    }

    public readonly onProgress: UploaderProgressCallback = (progress) => {
        if (progress.phase === "getDirHashes") {
            this.update({
                format: "Hashes | {count} files | {file}",
                total: 1,
                current: 0,
                payload: {
                    count: progress.current,
                    file: progress.filePath ?? "",
                },
            });
            if (progress.total !== undefined) {
                this.stop();
            }
            return;
        }

        this.update({
            format: "Sync {action} | {bar} {percentage}% | {value}/{total} | {file}",
            total: progress.total ?? 0,
            current: progress.current,
            payload: {
                action: progress.action ?? "sync",
                file: progress.filePath ?? "",
            },
        });
    };

    public update(state: ProgressBarState) {
        if (state.total <= 0) {
            return;
        }

        if (
            this.bar === undefined ||
            this.state?.format !== state.format ||
            this.state.total !== state.total
        ) {
            this.stop();
            this.bar = this.createBar(state.format);
            this.bar.start(state.total, state.current, state.payload ?? {});
            this.state = {
                format: state.format,
                total: state.total,
            };
            return;
        }

        this.bar.update(state.current, state.payload ?? {});
    }

    public stop() {
        if (this.bar !== undefined) {
            this.bar.stop();
            this.bar = undefined;
        }
        this.state = undefined;
    }
}

const cmd = new Command("Flash code to device (replace contents of ./code)", {
    action: async (
        options: Record<string, string | boolean>,
        args: Record<string, string>,
        env: Env
    ) => {
        const port = options["port"] as string;
        const baudrate = options["baudrate"] as string;
        const socket = options["socket"] as string;
        const projectPath = options["path"] as string;
        const programPath = options["programPath"] as string;

        const device = await getDevice(port, baudrate, socket, env);
        const project = new Project(fs, projectPath, logger);

        const files = await project.getFlashFiles();

        await device.controller.lock().catch((err: unknown) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        await device.controller.stop().catch((err: unknown) => {
            logger.verbose("Error stopping device: " + err);
        });

        const progressReporter = new FlashProgressReporter();

        try {
            logger.info("Getting current data hashes");
            const dataHashes = await device.uploader
                .getDirHashes("code", progressReporter.onProgress)
                .catch((err: unknown) => {
                    logger.verbose("Error getting data hashes: " + err);
                    throw err;
                });

            await device.uploader.uploadIfDifferent(
                dataHashes,
                files,
                "code",
                progressReporter.onProgress
            );
        } catch {
            progressReporter.stop();
            logger.info("Deleting old code");
            await device.uploader.deleteDirectory("code").catch((err: unknown) => {
                logger.verbose("Error deleting directory: " + err);
            });

            logger.info("Uploading all files");
            const totalFiles = Object.keys(files).length;
            progressReporter.update({
                format: "Sync {action} | {bar} {percentage}% | {value}/{total} | {file}",
                total: totalFiles,
                current: 0,
                payload: {
                    action: "upload",
                    file: "",
                },
            });
            const existingDirs = new Set<string>();
            let uploadedFiles = 0;
            for (const [filePath, content] of Object.entries(files)) {
                const fullPath = `code/${filePath}`;
                const dirPath = dirname(fullPath);
                if (dirPath && dirPath !== ".") {
                    await ensureDirectoryExists(
                        (path) => device.uploader.createDirectory(path),
                        dirPath,
                        existingDirs
                    );
                }
                await device.uploader.writeFile(fullPath, content).catch((err: unknown) => {
                    logger.verbose("Error writing file: " + err);
                    throw err;
                });
                uploadedFiles += 1;
                progressReporter.update({
                    format: "Sync {action} | {bar} {percentage}% | {value}/{total} | {file}",
                    total: totalFiles,
                    current: uploadedFiles,
                    payload: {
                        action: "upload",
                        file: filePath,
                    },
                });
            }
        } finally {
            progressReporter.stop();
        }

        console.log(`programPath: ${programPath}`);

        await device.controller.start(programPath).catch((err: unknown) => {
            logger.verbose("Error starting program: " + err);
            throw 1;
        });

        await device.controller.unlock().catch((err: unknown) => {
            stderr.write("Error unlocking device: " + err + "\n");
            throw 1;
        });
    },
    options: {
        path: new Opt("Project path", { required: true, defaultValue: "." }),
        programPath: new Opt("Program entry point path (default based on package.json)", {
            required: false,
            defaultValue: "",
        }),
    },
    chainable: true,
});

export default cmd;
