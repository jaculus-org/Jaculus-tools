import { Command } from "./lib/command.js";
import { stdout, stderr } from "process";
import { defaultPort, defaultSocket } from "./util.js";
import * as net from "net";
import { SerialPort } from "serialport";
const cmd = new Command("Tunnel a serial port over a TCP socket", {
    action: async (options) => {
        const baudrate = options["baudrate"];
        let socket = defaultSocket(options["socket"]);
        const portPath = await defaultPort(options["port"]);
        return new Promise((resolve, reject) => {
            if (socket.startsWith("localhost:")) {
                socket = socket.slice("localhost:".length);
            }
            stderr.write("Tunneling " + portPath + " at " + baudrate + " bauds\n");
            const sockets = new Set();
            const port = new SerialPort({
                path: portPath,
                baudRate: parseInt(baudrate),
                autoOpen: false
            });
            port.open((err) => {
                if (err) {
                    stderr.write("Port open error: " + err.message + "\n");
                    reject(1);
                }
                port.set({
                    rts: false,
                    dtr: false
                });
                setTimeout(() => {
                    port.set({
                        rts: true,
                        dtr: true
                    });
                }, 10);
            });
            port.on("error", (err) => {
                stderr.write("Port error: " + err.message + "\n");
                reject(1);
            });
            port.on("close", () => {
                stderr.write("Port closed\n");
                resolve();
            });
            port.on("data", (data) => {
                for (const socket of sockets) {
                    socket.write(data);
                }
                stdout.write("Port >> 『" + data + "』\n");
            });
            const server = net.createServer((socket) => {
                sockets.add(socket);
                socket.on("data", (data) => {
                    stdout.write("Sock >> 『" + data + "』\n");
                    port.write(data);
                });
                socket.on("close", () => {
                    sockets.delete(socket);
                    stderr.write("Socket closed\n");
                });
                socket.on("error", (err) => {
                    stderr.write("Socket error: " + err.message + "\n");
                });
            });
            server.on("close", () => {
                stderr.write("Server closed\n");
                port.close();
            });
            server.on("error", (err) => {
                stderr.write("Server error: " + err.message + "\n");
                reject(1);
            });
            server.listen(socket, () => {
                stderr.write("Server listening on port " + socket + "\n");
            });
            process.on("SIGINT", () => {
                stderr.write("Closing...\n");
                for (const socket of sockets.values()) {
                    socket.end();
                }
                server.close();
            });
        });
    }
});
export default cmd;
//# sourceMappingURL=serial-socket.js.map