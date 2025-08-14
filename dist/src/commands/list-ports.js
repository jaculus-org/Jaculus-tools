import { Command } from "./lib/command.js";
import { stdout } from "process";
import { SerialPort } from "serialport";
const cmd = new Command("List available serial ports", {
    action: async () => {
        const table = [{ path: "Path", manufacturer: "Manufacturer" }];
        const ports = await SerialPort.list();
        for (const port of ports) {
            table.push({
                path: port.path,
                manufacturer: port.manufacturer
            });
        }
        let maxPathLength = 0;
        for (const row of table) {
            maxPathLength = Math.max(maxPathLength, row.path.length);
        }
        let first = true;
        for (const row of table) {
            stdout.write(row.path.padEnd(maxPathLength) + "  " + (row.manufacturer || "") + "\n");
            if (first) {
                first = false;
                stdout.write("-".repeat(maxPathLength) + "  " + "-".repeat(12) + "\n");
            }
        }
        return;
    }
});
export default cmd;
//# sourceMappingURL=list-ports.js.map