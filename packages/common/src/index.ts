type LogMethod = (message?: string) => void;

export interface Logger {
    error: LogMethod;
    warn: LogMethod;
    info: LogMethod;
    verbose: LogMethod;
    debug: LogMethod;
    silly: LogMethod;
}

export type FSPromisesInterface = typeof import("fs").promises;
export type FSInterface = typeof import("fs");
