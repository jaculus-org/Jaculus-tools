import * as tsvfs from "./vfs.js";
import path from "path";
import { fileURLToPath } from "url";
import { FSInterface } from "../fs.js";
import ts from "typescript";
import { Logger } from "@jaculus/common";

type Writable = { write: (chunk: string) => void };

function printMessage(message: string | ts.DiagnosticMessageChain, logger: Logger, indent = 0) {
    if (typeof message === "string") {
        logger.warn(" ".repeat(indent * 2) + message + "\n");
    } else {
        logger.warn(" ".repeat(indent * 2) + message.messageText + "\n");
        if (message.next) {
            for (const next of message.next) {
                printMessage(next, logger, indent + 1);
            }
        }
    }
}

function validateProjectTsconfig(compilerOptions: ts.CompilerOptions, outDir: string) {
    const forcedOptions: Record<string, any[]> = {
        target: [ts.ScriptTarget.ES2023, ts.ScriptTarget.ES2020],
        module: [ts.ModuleKind.ES2022, ts.ModuleKind.ES2020],
        moduleResolution: [ts.ModuleResolutionKind.NodeJs],
        resolveJsonModule: [false],
        esModuleInterop: [true],
        outDir: [outDir],
    };

    const optionNames: Record<string, Record<any, string>> = {
        target: Object.entries(ts.ScriptTarget).reduce((acc, [k, v]) => ({ ...acc, [v]: k }), {}),
        module: Object.entries(ts.ModuleKind).reduce((acc, [k, v]) => ({ ...acc, [v]: k }), {}),
        moduleResolution: Object.entries(ts.ModuleResolutionKind).reduce(
            (acc, [k, v]) => ({ ...acc, [v]: k }),
            {}
        ),
    };

    for (const [key, values] of Object.entries(forcedOptions)) {
        const valueNames = values.map((v) => optionNames[key]?.[v] ?? v).join(", ");
        if (compilerOptions[key] && !values.includes(compilerOptions[key])) {
            throw new Error(`tsconfig.json must have ${key} set to one of: [ ${valueNames} ]`);
        } else if (!compilerOptions[key]) {
            compilerOptions[key] = values[0];
        }
    }
}

export async function compileProject(
    fs: FSInterface,
    projectPath: string,
    out: Writable,
    logger: Logger,
    tsLibsPath: string = path.dirname(
        fileURLToPath(import.meta.resolve?.("typescript") ?? "typescript")
    )
): Promise<boolean> {
    const outDir = "build";
    const system = tsvfs.createSystem(fs, projectPath);

    const tsconfig = ts.findConfigFile("./", system.fileExists, "tsconfig.json");
    if (!tsconfig) {
        throw new Error(`Could not find tsconfig.json in directory: ${projectPath}`);
    }
    const configJsonFile = ts.readConfigFile(tsconfig, system.readFile);
    if (configJsonFile.error) {
        printMessage(configJsonFile.error.messageText, logger);
        throw new Error("Error reading tsconfig.json");
    }

    validateProjectTsconfig(configJsonFile.config, outDir);
    return await compile(configJsonFile.config, system, out, logger, false, tsLibsPath);
}

export async function compileLibrary(
    fs: FSInterface,
    libraryPath: string,
    out: Writable,
    logger: Logger,
    transpileOnly: boolean = false,
    tsLibsPath: string = path.dirname(
        fileURLToPath(import.meta.resolve?.("typescript") ?? "typescript")
    )
): Promise<boolean> {
    const system = tsvfs.createSystem(fs, libraryPath);

    const configJson = {
        compilerOptions: {
            target: "ES2023",
            module: "ES2022",
            lib: ["es2023"],
            moduleResolution: "node",
            declaration: true,
            declarationDir: "dist/types",
            outDir: "dist/js",
            rootDir: "src",
            strict: true,
            baseUrl: ".",
            noEmitOnError: !transpileOnly,
        },
        include: ["src"],
    };

    return await compile(configJson, system, out, logger, transpileOnly, tsLibsPath);
}

/**
 * Compiles TypeScript files with custom FSInterface
 * @param configJson - The tsconfig.json content as a JavaScript object.
 * @param system - The TypeScript System implementation that uses the custom FSInterface.
 * @param logger - The logger for error and info messages.
 * @param out - The writable stream for standard output messages.
 * @param tsLibsPath - The path to TypeScript libraries (in Node, it's the directory of the 'typescript' package)
 *                     (in zenfs, it's necessary to provide this path and copy TS files to the virtual FS in advance)
 * @returns A promise that resolves to true if compilation is successful, false otherwise.
 */
export async function compile(
    configJson: Record<string, unknown>,
    system: ts.System,
    out: Writable,
    logger: Logger,
    transpileOnly: boolean = false,
    tsLibsPath: string = path.dirname(
        fileURLToPath(import.meta.resolve?.("typescript") ?? "typescript")
    )
): Promise<boolean> {
    const { options, fileNames, errors } = ts.parseJsonConfigFileContent(configJson, system, "./");
    if (errors.length > 0) {
        errors.forEach((error) => printMessage(error.messageText, logger));
        throw new Error(`Error parsing tsconfig.json - ${errors.length} error(s) found`);
    }

    out?.write("Compiling files: [" + fileNames.join(", ") + "]\n");

    const host = tsvfs.createVirtualCompilerHost(system, options, tsLibsPath);

    const program = ts.createProgram({
        rootNames: fileNames,
        options,
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
            printMessage(`${diagnostic.file.fileName} (${line + 1}:${character + 1}): `, logger);
            printMessage(diagnostic.messageText, logger);
        } else {
            printMessage(diagnostic.messageText, logger);
        }
    }

    if (emitResult.emitSkipped) {
        throw new Error("Compilation failed");
    }

    return !emitResult.emitSkipped && (transpileOnly || !error);
}
