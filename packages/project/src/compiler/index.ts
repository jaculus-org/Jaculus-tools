import { FSInterface, Logger } from "@jaculus/common";
import ts from "typescript";
import * as tsvfs from "./vfs.js";
import path from "path";
import { fileURLToPath } from "url";

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

/**
 * Compiles TypeScript files with custom FSInterface
 * @param fs - The file system interface (Node, zenfs, etc.)
 * @param inputDir - The input directory containing TypeScript files.
 * @param outDir - The output directory for compiled files.
 * @param err - The writable stream for error messages.
 * @param logger - The logger instance.
 * @param tsLibsPath - The path to TypeScript libraries (in Node, it's the directory of the 'typescript' package)
 *                     (in zenfs, it's necessary to provide this path and copy TS files to the virtual FS in advance)
 * @returns A promise that resolves to true if compilation is successful, false otherwise.
 */
export async function compile(
    fs: FSInterface,
    inputDir: string,
    outDir: string,
    err: Writable,
    logger?: Logger,
    tsLibsPath: string = path.dirname(fileURLToPath(import.meta.resolve?.("typescript")))
): Promise<boolean> {
    const system = tsvfs.createSystem(fs, inputDir);
    const tsconfig = ts.findConfigFile("./", system.fileExists, "tsconfig.json");
    if (!tsconfig) {
        throw new Error("Could not find tsconfig.json");
    }
    const config = ts.readConfigFile(tsconfig, system.readFile);
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

    const {
        options: compilerOptions,
        fileNames,
        errors,
    } = ts.parseJsonConfigFileContent(config.config, system, "./");
    if (errors.length > 0) {
        errors.forEach((error) => printMessage(error.messageText, err));
        throw new Error("Error parsing tsconfig.json");
    }

    for (const [key, values] of Object.entries(forcedOptions)) {
        if (compilerOptions[key] && !values.includes(compilerOptions[key])) {
            throw new Error(
                `tsconfig.json must have ${key} set to one of: [ ${values.join(", ")} ]`
            );
        } else if (!compilerOptions[key]) {
            compilerOptions[key] = values[0];
        }
    }

    logger?.verbose("Compiling files:" + fileNames.join(", "));

    const host = tsvfs.createVirtualCompilerHost(system, compilerOptions, ts, tsLibsPath);

    const program = ts.createProgram({
        rootNames: fileNames,
        options: compilerOptions,
        host: host.compilerHost,
    });
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
