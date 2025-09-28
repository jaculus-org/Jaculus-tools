import { FSInterface, Logger } from "@jaculus/common";
import ts from "typescript";
import * as path from "path";

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

export function compile(
    fs: FSInterface,
    input: string,
    outDir: string,
    err: Writable,
    logger?: Logger,
    workingDirectory?: string
): boolean {
    const tryCatchWrapper = <T>(fn: () => T): T | undefined => {
        try {
            return fn();
        } catch (error) {
            logger?.error((error as Error).message);
            return undefined;
        }
    };

    // Resolve input path to absolute path
    const absoluteInput = path.isAbsolute(input)
        ? input
        : path.resolve(workingDirectory || process.cwd(), input);

    const tsconfig = ts.findConfigFile(
        absoluteInput,
        (configPath) => {
            return tryCatchWrapper(() => fs.existsSync(configPath)) || false;
        },
        "tsconfig.json"
    );

    if (!tsconfig) {
        throw new Error(`Could not find tsconfig.json in ${absoluteInput} or parent directories`);
    }

    const config = ts.readConfigFile(
        tsconfig,
        (path) => tryCatchWrapper(() => fs.readFileSync(path, "utf8")) || ""
    );
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
    };

    // Create a custom TypeScript system using the provided fs
    const cwd = workingDirectory || process.cwd();

    const customSys: ts.System = {
        args: process.argv.slice(2),
        newLine: "\n",
        useCaseSensitiveFileNames: true,
        write: (s: string) => process.stdout.write(s),
        writeOutputIsTTY: () => process.stdout.isTTY,
        getWidthOfTerminal: () => process.stdout.columns || 80,
        resolvePath: (pathToResolve) => {
            if (path.isAbsolute(pathToResolve)) {
                return pathToResolve;
            }
            return path.resolve(cwd, pathToResolve);
        },
        exit: (exitCode) => process.exit(exitCode),
        fileExists: (path) => {
            return tryCatchWrapper(() => fs.existsSync(path)) || false;
        },
        readFile: (path) => {
            return tryCatchWrapper(() => fs.readFileSync(path, "utf8"));
        },
        readDirectory: (dirPath, extensions, exclude, include, depth) => {
            return (
                tryCatchWrapper(() => {
                    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                    const result: string[] = [];

                    for (const entry of entries) {
                        const fullPath = path.join(dirPath, entry.name);
                        const relativePath = path.relative(cwd, fullPath);

                        // Skip excluded paths
                        if (
                            exclude &&
                            exclude.some((pattern) => {
                                // Simple pattern matching - can be improved
                                return relativePath.includes(pattern) || entry.name === pattern;
                            })
                        ) {
                            continue;
                        }

                        if (entry.isFile()) {
                            // Check if file matches any of the extensions
                            if (
                                !extensions ||
                                extensions.length === 0 ||
                                extensions.some((ext) => entry.name.endsWith(ext))
                            ) {
                                result.push(fullPath);
                            }
                        } else if (entry.isDirectory() && depth !== 0) {
                            // Recursively read subdirectories if depth allows
                            const subResults = customSys.readDirectory(
                                fullPath,
                                extensions,
                                exclude,
                                include,
                                depth ? depth - 1 : undefined
                            );
                            result.push(...subResults);
                        }
                    }

                    return result;
                }) || []
            );
        },
        realpath: (filePath) => {
            return (
                tryCatchWrapper(() => (fs.realpathSync ? fs.realpathSync(filePath) : filePath)) ||
                filePath
            );
        },
        getCurrentDirectory: () => cwd,
        getDirectories: (path) => {
            return (
                tryCatchWrapper(() =>
                    fs
                        .readdirSync(path, { withFileTypes: true })
                        .filter((dirent) => dirent.isDirectory())
                        .map((dirent) => dirent.name)
                ) || []
            );
        },
        writeFile: (path, data) => {
            tryCatchWrapper(() => fs.writeFileSync(path, data, "utf8"));
        },
        directoryExists: (path) => {
            return tryCatchWrapper(() => fs.lstatSync(path).isDirectory()) || false;
        },
        createDirectory: (path) => {
            tryCatchWrapper(() => fs.mkdirSync(path, { recursive: true }));
        },
        getExecutingFilePath: () => process.argv[1] || "",
        getModifiedTime: (path) => {
            return tryCatchWrapper(() => fs.statSync(path).mtime);
        },
        setModifiedTime: (filePath, time) => {
            tryCatchWrapper(() => {
                if (fs.utimesSync) {
                    fs.utimesSync(filePath, time, time);
                }
            });
        },
        deleteFile: (path) => {
            tryCatchWrapper(() => fs.unlinkSync(path));
        },
    };

    const { options, fileNames, errors } = ts.parseJsonConfigFileContent(
        config.config,
        customSys,
        absoluteInput
    );

    if (errors.length > 0) {
        errors.forEach((error) => printMessage(error.messageText, err));
        // If no files found, provide more helpful information
        if (fileNames.length === 0) {
            tryCatchWrapper(() => fs.readdirSync(absoluteInput));
        }
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

    if (fileNames.length === 0) {
        err.write("No TypeScript files found to compile.\n");
        err.write(`Input directory: ${input}\n`);
        err.write(`Working directory: ${cwd}\n`);
        try {
            const dirContents = tryCatchWrapper(() => fs.readdirSync(input)) || [];
            err.write(`Directory contents: ${dirContents.join(", ")}\n`);
        } catch (e) {
            err.write(`Error reading input directory: ${e}\n`);
        }
        return false;
    }

    // Create a custom compiler host that uses the provided fs
    const host = ts.createCompilerHost(options);
    host.readFile = (fileName) => {
        return tryCatchWrapper(() => fs.readFileSync(fileName, "utf8"));
    };
    host.fileExists = (fileName) => {
        return tryCatchWrapper(() => fs.existsSync(fileName)) || false;
    };
    host.getSourceFile = (fileName, languageVersion, onError) => {
        const sourceText = tryCatchWrapper(() => fs.readFileSync(fileName, "utf8"));
        if (sourceText !== undefined) {
            return ts.createSourceFile(fileName, sourceText, languageVersion, false);
        }
        if (onError) {
            onError(`Failed to read source file: ${fileName}`);
        }
        return undefined;
    };

    const program = ts.createProgram(fileNames, options, host);
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
