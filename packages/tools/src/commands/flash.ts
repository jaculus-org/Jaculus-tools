import { Command, Env, Opt } from "./lib/command.js";
import { stderr } from "process";
import { getDevice } from "./util.js";
import { logger } from "../logger.js";
import fs from "fs";
import { Project } from "@jaculus/project";
import type { UploaderProgressCallback } from "@jaculus/device";
import cliProgress from "cli-progress";

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

        const device = await getDevice(port, baudrate, socket, env);
        const project = new Project(fs, projectPath, logger);

        const bundle = await project.getFlashFiles();

        await device.controller.lock().catch((err: unknown) => {
            stderr.write("Error locking device: " + err + "\n");
            throw 1;
        });

        await device.controller.stop().catch((err: unknown) => {
            logger.verbose("Error stopping device: " + err);
        });

        const progressReporter = new FlashProgressReporter();

        try {
            await device.uploader.uploadFiles(bundle, "code", progressReporter.onProgress);
        } finally {
            progressReporter.stop();
        }

        // if does not exist package.json in the bundle, use index.js (backwards compatibility)
        let entryPoint = ""; // deduced from package.json
        if (!bundle.files["package.json"]) {
            entryPoint = "index.js";
        }

        await device.controller.start(entryPoint).catch((err: unknown) => {
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
