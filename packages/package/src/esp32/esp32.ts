import { Package } from "../package.js";
import { ESPLoader, NodeTransport } from "@cubicap/esptool-js";
import { SerialPort } from "serialport";
import { logger } from "@jaculus/util/logger.js";
import cliProgress from "cli-progress";
import { stdout } from "process";

/**
 * Flasher for the esp32 platform
 *
 * Allows flashing boards based on the esp32 platform
 * Config options in manifest.json:
 * - flashBaud: The baudrate to use for flashing (default: 921600)
 * - chip: The chip type
 * - partitions: An array of partitions to flash
 *   - name: The name of the partition
 *   - address: The start address of the partition
 *   - file: The file from the package to flash
 *
 * Example manifest.json:
 * {
 *     "board": "ESP32-DevKitC",
 *     "version": "v0.0.5",
 *     "platform": "esp32",
 *     "config": {
 *         "flashBaud": 921600,
 *         "chip": "ESP32",
 *         "partitions": [
 *             {
 *                 "name": "bootloader",
 *                 "address": "0x1000",
 *                 "file": "bootloader.bin",
 *                 "isStorage": false
 *             },
 *             ...
 *         ]
 *     }
 * }
 */

class UploadReporter {
    private bar: cliProgress.SingleBar;
    private fileIndex: number;

    constructor(private files: { size: number; name: string }[]) {
        this.fileIndex = 0;
        this.bar = this.createBar(this.fileIndex);
    }

    private createBar(fileIndex: number) {
        const fileName = this.files[fileIndex].name;

        return new cliProgress.SingleBar(
            {
                format: `${fileIndex + 1}/${this.files.length} | {bar} {percentage}% | ${fileName} | {value} / {total}`,
                hideCursor: true,
            },
            cliProgress.Presets.rect
        );
    }

    public update(fileIndex: number, written: number) {
        if (fileIndex !== this.fileIndex) {
            this.bar.update(this.bar.getTotal());
            this.bar.stop();
            this.fileIndex = fileIndex;
            this.bar = this.createBar(this.fileIndex);
            this.bar.start(this.files[this.fileIndex].size, 0);
        }

        this.bar.update(written);
    }

    public start() {
        this.bar.start(this.files[this.fileIndex].size, 0);
    }

    public stop() {
        this.bar.update(this.bar.getTotal());
        this.bar.stop();
    }
}

export async function flash(Package: Package, path: string, noErase: boolean): Promise<void> {
    const config = Package.getManifest().getConfig();

    const flashBaud = parseInt(config["flashBaud"] ?? 921600);

    const partitions = config["partitions"];
    if (!partitions) {
        throw new Error("No partitions defined");
    }

    const list = await SerialPort.list();
    const info = list.find((port) => port.path === path);
    if (!info) {
        throw new Error("Port not found");
    }

    stdout.write("Connecting to " + info.path + "...\n");

    const port = new SerialPort({
        path: info.path,
        baudRate: 115200,
        autoOpen: false,
    });

    const loaderOptions: any = {
        debugLogging: false,
        transport: new NodeTransport(port),
        baudrate: flashBaud,
        romBaudrate: 115200,
        terminal: {
            clean: () => {},
            writeLine: (data: any) => {
                logger.debug(data);
            },
            write: (data: any) => {
                logger.debug(data);
            },
        },
    };
    const esploader = new ESPLoader(loaderOptions);

    const fileArray: { data: string; address: number; fileName: string }[] = [];
    const skipped: string[] = [];
    for (const partition of partitions) {
        const file = partition["file"];
        if (file === undefined) {
            throw new Error("No file defined for partition");
        }
        const address = parseInt(partition["address"]);
        if (address === undefined) {
            throw new Error("No address defined for partition");
        }
        const isStorage = partition["isStorage"];
        if (isStorage && noErase) {
            skipped.push(file);
            continue;
        }
        const dataBuffer = Package.getData()[file];
        if (dataBuffer === undefined) {
            throw new Error("File not found in package");
        }

        fileArray.push({ data: esploader.ui8ToBstr(dataBuffer), address: address, fileName: file });
    }

    const reporter = new UploadReporter(
        fileArray.map((file) => {
            return {
                size: file.data.length,
                name: file.fileName,
            };
        })
    );

    try {
        await esploader.main_fn();

        stdout.write("Detected chip type: " + esploader.chip.CHIP_NAME + "\n");
        stdout.write("Flash size: " + (await esploader.get_flash_size()) + "K\n");

        stdout.write("\n");

        if (esploader.chip.CHIP_NAME !== config["chip"]) {
            throw new Error(
                "Chip type mismatch (expected " +
                    config["chip"] +
                    ", got " +
                    esploader.chip.CHIP_NAME +
                    ")"
            );
        }

        for (const file of skipped) {
            stdout.write("Skipping " + file + " (storage partition)\n");
        }

        stdout.write("\nWriting flash...\n");

        reporter.start();
        await esploader.write_flash({
            fileArray: fileArray,
            flashSize: "4MB",
            flashMode: "keep",
            flashFreq: "keep",
            eraseAll: false,
            compress: true,
            reportProgress: (fileIndex: number, written: number) => {
                reporter.update(fileIndex, written);
            },
        });
    } finally {
        reporter.stop();
        await esploader.hard_reset();
        await esploader.transport.disconnect();
    }
}

export function info(Package: Package): string {
    const config = Package.getManifest().getConfig();

    let output = "Chip type: " + config["chip"] + "\n";
    if (config["flashBaud"]) {
        output += "Flash baudrate: " + config["flashBaud"] + "\n";
    }
    output += "Partitions:\n";

    const partitions = config["partitions"];
    if (!partitions) {
        throw new Error("No partitions defined");
    }

    for (const partition of partitions) {
        const file = partition["file"];
        if (file === undefined) {
            throw new Error("No file defined for partition");
        }
        const address = parseInt(partition["address"]);
        if (address === undefined) {
            throw new Error("No address defined for partition");
        }
        const dataBuffer = Package.getData()[file];
        if (dataBuffer === undefined) {
            throw new Error("File not found in package");
        }
        const isStorage = partition["isStorage"];

        output += `  ${file} (at 0x${address.toString(16)}, ${dataBuffer.length}`;
        if (isStorage) {
            output += ", storage)";
        } else {
            output += ")";
        }
        output += "\n";
    }

    return output;
}
