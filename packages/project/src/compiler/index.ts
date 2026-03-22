import * as tsvfs from "./vfs.js";
import path from "path";
import { fileURLToPath } from "url";
import { FSInterface } from "../fs.js";
import ts from "typescript";
import { Logger } from "@jaculus/common";

function printMessage(message: string | ts.DiagnosticMessageChain, logger: Logger, indent = 0) {
    if (typeof message === "string") {
        logger.warn(" ".repeat(indent * 2) + message);
    } else {
        logger.warn(" ".repeat(indent * 2) + message.messageText);
        if (message.next) {
            for (const next of message.next) {
                printMessage(next, logger, indent + 1);
            }
        }
    }
}

// Required compiler options for Jaculus in tsconfig.json shape
function buildForcedOptions(outDir: string): Record<string, Array<string | boolean>> {
    return {
        target: ["es2023", "es2020"],
        module: ["es2022", "es2020"],
        moduleResolution: ["node"],
        resolveJsonModule: [false],
        esModuleInterop: [true],
        outDir: [outDir],
    };
}

// Validates and fills in required tsconfig compiler options; throws if an option is set to an unsupported value
function validateProjectTsconfig(compilerOptions: Record<string, unknown>, outDir: string) {
    const forcedOptions = buildForcedOptions(outDir);

    for (const [key, values] of Object.entries(forcedOptions)) {
        const valueNames = values.join(", ");
        const currentValue = compilerOptions[key];
        let normalizedValue: string | boolean | undefined;
        if (typeof currentValue === "string") {
            normalizedValue = key === "outDir" ? currentValue : currentValue.toLowerCase();
        } else if (typeof currentValue === "boolean") {
            normalizedValue = currentValue;
        } else if (currentValue !== undefined && currentValue !== null) {
            throw new Error(`tsconfig.json must have ${key} set to one of: [ ${valueNames} ]`);
        }

        if (normalizedValue !== undefined && !values.includes(normalizedValue)) {
            throw new Error(`tsconfig.json must have ${key} set to one of: [ ${valueNames} ]`);
        } else if (currentValue === undefined || currentValue === null) {
            compilerOptions[key] = values[0];
        }
    }
}

// Reads tsconfig.json from the project directory + validate it
function readProjectTsconfig(
    system: ts.System,
    projectPath: string,
    outDir: string,
    logger: Logger
): Record<string, unknown> {
    const tsconfig = ts.findConfigFile("./", system.fileExists, "tsconfig.json");
    if (!tsconfig) {
        throw new Error(`Could not find tsconfig.json in directory: ${projectPath}`);
    }

    const configJsonFile = ts.readConfigFile(tsconfig, system.readFile);
    if (configJsonFile.error) {
        printMessage(configJsonFile.error.messageText, logger);
        throw new Error("Error reading tsconfig.json");
    }

    configJsonFile.config.compilerOptions ??= {};
    validateProjectTsconfig(configJsonFile.config.compilerOptions, outDir);
    return configJsonFile.config;
}

function parseTsConfig(
    configJson: Record<string, unknown>,
    system: ts.System,
    logger: Logger
): { options: ts.CompilerOptions; fileNames: string[] } {
    const { options, fileNames, errors } = ts.parseJsonConfigFileContent(configJson, system, "./");
    if (errors.length > 0) {
        errors.forEach((error) => printMessage(error.messageText, logger));
        throw new Error(`Error parsing tsconfig.json - ${errors.length} error(s) found`);
    }
    return { options, fileNames };
}

function buildAndEmit(
    fileNames: string[],
    options: ts.CompilerOptions,
    host: ReturnType<typeof tsvfs.createVirtualCompilerHost>
): { program: ts.Program; emitResult: ts.EmitResult } {
    const program = ts.createProgram({
        rootNames: fileNames,
        options,
        host: host.compilerHost,
    });
    const emitResult = program.emit();
    return { program, emitResult };
}

function reportDiagnostics(diagnostics: readonly ts.Diagnostic[], logger: Logger): boolean {
    const hasError = diagnostics.some(
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
            printMessage(`${diagnostic.file.fileName} (${line + 1}:${character + 1}): `, logger);
            printMessage(diagnostic.messageText, logger);
        } else {
            printMessage(diagnostic.messageText, logger);
        }
    }

    return hasError;
}

export async function compileProjectTsconfig(
    configJson: Record<string, unknown>,
    system: ts.System,
    logger: Logger,
    noCheck: boolean = false,
    tsLibsPath: string = path.dirname(
        fileURLToPath(import.meta.resolve?.("typescript") ?? "typescript")
    )
): Promise<boolean> {
    const { options, fileNames } = parseTsConfig(configJson, system, logger);
    logger.info("Compiling project");
    logger.verbose("Project files: [" + fileNames.join(", ") + "]");

    const host = tsvfs.createVirtualCompilerHost(system, options, tsLibsPath);
    const { program, emitResult } = buildAndEmit(fileNames, options, host);

    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
    const hasError = reportDiagnostics(diagnostics, logger);

    if (emitResult.emitSkipped) {
        throw new Error("Compilation failed");
    }

    return !emitResult.emitSkipped && (noCheck || !hasError);
}

/**
 * Compiles a TypeScript project located at the given path
 * @param fs Filesystem interface for file operations
 * @param projectPath Path to the project directory (should contain tsconfig.json)
 * @param logger Logger for outputting messages and diagnostics
 * @param noCheck If true, compiles without type checking, emitting JavaScript even if there are type errors
 * @param tsLibsPath Optional path to TypeScript libraries (lib.d.ts, etc.), defaults to the directory of the installed TypeScript package
 * @returns Promise that resolves to true if compilation succeeded
 */
export async function compileProjectPath(
    fs: FSInterface,
    projectPath: string,
    logger: Logger,
    noCheck: boolean = false,
    tsLibsPath: string = path.dirname(
        fileURLToPath(import.meta.resolve?.("typescript") ?? "typescript")
    )
): Promise<boolean> {
    const outDir = "build";
    const system = tsvfs.createSystem(fs, projectPath);
    const configJson = readProjectTsconfig(system, projectPath, outDir, logger);

    return await compileProjectTsconfig(configJson, system, logger, noCheck, tsLibsPath);
}
