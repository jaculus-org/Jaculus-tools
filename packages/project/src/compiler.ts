import { FSInterface, Logger } from "@jaculus/common";
import ts from "typescript";

type Writable = { write: (chunk: string) => void };

function printMessage(message: string | ts.DiagnosticMessageChain, stream: Writable, indent = 0) {
    if (typeof message === "string") {
        stream.write(" ".repeat(indent * 2) + message + "\n");
    } else {
        stream.write(" ".repeat(indent * 2) + message.messageText + "\n");
        if (message.next) {
            for (const next of message.next) {
                printMessage(next, stream, indent + 1);
            }
        }
    }
}

export async function compile(
    fs: FSInterface,
    input: string,
    outDir: string,
    out: Writable,
    err: Writable,
    workingDirectory: string,
    logger?: Logger,
): Promise<boolean> {
    const tryCatchWrapper = <T>(fn: () => T): T | undefined => {
        try {
            return fn();
        } catch (error) {
            logger?.error((error as Error).message);
            err.write((error as Error).message);
            return undefined;
        }
    };
    const tsconfig = ts.findConfigFile(input, ts.sys.fileExists, "tsconfig.json");
    if (!tsconfig) {
        throw new Error("Could not find tsconfig.json");
    }
    const config = ts.readConfigFile(tsconfig, ts.sys.readFile);
    if (config.error) {
        printMessage(config.error.messageText, err);
        throw new Error("Error reading tsconfig.json");
    }

    const forcedOptions: Record<string, any[]> = {
        target: [ts.ScriptTarget.ES2023, ts.ScriptTarget.ES2020],
        module: [ts.ModuleKind.ES2022, ts.ModuleKind.ES2020],
        moduleResolution: [ts.ModuleResolutionKind.NodeJs],
        resolveJsonModule: [false],
        esModuleInterop: [true],
        outDir: [outDir],
    };

    const { options, fileNames, errors } = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        input
    );
    if (errors.length > 0) {
        errors.forEach((error) => printMessage(error.messageText, err));
        throw new Error("Error parsing tsconfig.json");
    }

    for (const [key, values] of Object.entries(forcedOptions)) {
        if (options[key] && !values.includes(options[key])) {
            throw new Error(
                `tsconfig.json must have ${key} set to one of: [ ${values.join(", ")} ]`
            );
        } else if (!options[key]) {
            options[key] = values[0];
        }
    }

    logger?.verbose("Compiling files:" + fileNames.join(", "));

    const program = ts.createProgram(fileNames, options);
    const emitResult = program.emit();

    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    const error = diagnostics.some(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    );

    for (const diagnostic of diagnostics) {
        if (diagnostic.file) {
            if (!diagnostic.start) {
                throw new Error("Diagnostic has no start");
            }
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
                diagnostic.start
            );
            printMessage(`${diagnostic.file.fileName} (${line + 1}:${character + 1}): `, err);
            printMessage(diagnostic.messageText, err);
        } else {
            printMessage(diagnostic.messageText, err);
        }
    }

    if (emitResult.emitSkipped) {
        throw new Error("Compilation failed");
    }

    return !emitResult.emitSkipped && !error;
}