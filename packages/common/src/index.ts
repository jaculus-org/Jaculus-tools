type LogMethod = (message?: string) => void;

export interface Logger {
    error: LogMethod;
    warn: LogMethod;
    info: LogMethod;
    verbose: LogMethod;
    debug: LogMethod;
    silly: LogMethod;
}

export { FSInterface } from "./fs.js";
