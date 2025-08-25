import { Logger } from "@jaculus/util/index.js";
import { stderr } from "process";
import { Writable } from "stream";
import ts from "typescript";

function printMessage(
    message: string | ts.DiagnosticMessageChain,
    stream: Writable = stderr,
    indent = 0
) {
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

export function compile(
    input: string,
    outDir: string,
    logger?: Logger,
    err: Writable = stderr
): boolean {
    const tsconfig = ts.findConfigFile(input, ts.sys.fileExists, "tsconfig.json");
    if (!tsconfig) {
        throw new Error("Could not find tsconfig.json");
    }
    const config = ts.readConfigFile(tsconfig, ts.sys.readFile);
    if (config.error) {
        printMessage(config.error.messageText, err);
        throw new Error("Error reading tsconfig.json");
    }

    const forcedOptions: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ES2020,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        resolveJsonModule: false,
        esModuleInterop: true,
        outDir: outDir,
    };

    config.config.compilerOptions = config.config.compilerOptions || forcedOptions;

    const { options, fileNames, errors } = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        input
    );
    if (errors.length > 0) {
        errors.forEach((error) => printMessage(error.messageText, err));
        throw new Error("Error parsing tsconfig.json");
    }

    for (const [key, value] of Object.entries(forcedOptions)) {
        if (options[key] && options[key] !== value) {
            throw new Error(`tsconfig.json must have ${key} set to ${value}`);
        } else {
            options[key] = value;
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
