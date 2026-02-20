import { System, CompilerOptions, CompilerHost, SourceFile } from "typescript";
import ts from "typescript";
import path from "path";
import { FSInterface } from "../fs.js";

function notImplemented(methodName: string): any {
    throw new Error(`Method '${methodName}' is not implemented.`);
}

/**
 * Creates System object for TypeScript compiler API which uses the provided virtual file system
 * All paths provided to the System methods are resolved relative to the provided preFix path
 * @param fsVirtual The virtual file system to use
 * @param preFix The prefix path to resolve all paths against
 */
export function createSystem(fsVirtual: FSInterface, preFix: string): System {
    const resolveVirtualPath = (inputPath: string) =>
        path.isAbsolute(inputPath) ? path.normalize(inputPath) : path.join(preFix, inputPath);

    const toRelativeFromPrefix = (absolutePath: string) =>
        path.relative(preFix, path.normalize(absolutePath));

    return {
        args: [],
        createDirectory: (dirName) =>
            fsVirtual.mkdirSync(resolveVirtualPath(dirName), { recursive: true }),
        directoryExists: (directory) => fsVirtual.existsSync(resolveVirtualPath(directory)),
        exit: () => notImplemented("exit"),
        fileExists: (fileName) => fsVirtual.existsSync(resolveVirtualPath(fileName)),
        getCurrentDirectory: () => preFix,
        getDirectories: (directory) => {
            const absoluteDir = resolveVirtualPath(directory);
            if (!fsVirtual.existsSync(absoluteDir)) {
                return [];
            }

            const entries = fsVirtual.readdirSync(absoluteDir);
            const directories: string[] = [];

            for (const entry of entries) {
                const fullPath = path.join(absoluteDir, entry);
                const stats = fsVirtual.statSync(fullPath);
                if (stats.isDirectory()) {
                    directories.push(path.join(absoluteDir, entry));
                }
            }

            return directories;
        },
        getExecutingFilePath: () => notImplemented("getExecutingFilePath"),
        readDirectory: (directory, extensions, excludes, includes, depth) => {
            const absoluteDir = resolveVirtualPath(directory);

            // ts.matchFiles is an internal API not exposed in types, but it is used by the compiler
            const matchResult = (ts as any).matchFiles(
                absoluteDir,
                extensions,
                excludes,
                includes,
                true,
                preFix,
                depth,
                (dirPath: string) => {
                    const absDirPath = resolveVirtualPath(dirPath);
                    if (!fsVirtual.existsSync(absDirPath)) {
                        return { files: [], directories: [] };
                    }

                    const files: string[] = [];
                    const directories: string[] = [];

                    for (const entry of fsVirtual.readdirSync(absDirPath)) {
                        const fullEntryPath = path.join(absDirPath, entry);
                        const stats = fsVirtual.statSync(fullEntryPath);
                        if (stats.isDirectory()) {
                            directories.push(entry);
                        } else {
                            files.push(entry);
                        }
                    }

                    return { files, directories };
                },
                (fileName: string) => resolveVirtualPath(fileName)
            );

            return matchResult.map(toRelativeFromPrefix);
        },
        readFile: (fileName) => fsVirtual.readFileSync(resolveVirtualPath(fileName), "utf-8"),
        resolvePath: (filePath) => path.normalize(filePath),
        newLine: "\n",
        useCaseSensitiveFileNames: true,
        write: () => notImplemented("write"),
        writeFile: (fileName, contents) => {
            const fullPath = resolveVirtualPath(fileName);
            const dir = path.dirname(fullPath);
            fsVirtual.mkdirSync(dir, { recursive: true });
            fsVirtual.writeFileSync(fullPath, contents, "utf-8");
        },
        deleteFile: (fileName) => fsVirtual.unlinkSync(resolveVirtualPath(fileName)),
    };
}

/**
 * Creates a virtual TypeScript CompilerHost that works with the provided System
 */
export function createVirtualCompilerHost(
    sys: System,
    compilerOptions: CompilerOptions,
    typescriptLibPath: string
) {
    type Return = {
        compilerHost: CompilerHost;
        updateFile: (sourceFile: SourceFile) => boolean;
        deleteFile: (sourceFile: SourceFile) => boolean;
    };

    const vHost: Return = {
        compilerHost: {
            ...sys,
            getCanonicalFileName: (fileName) => fileName,
            getDefaultLibFileName: () => {
                const libFileName = ts.getDefaultLibFileName(compilerOptions);
                return path.join(typescriptLibPath!, libFileName);
            },
            getDefaultLibLocation: () => typescriptLibPath!,
            getNewLine: () => sys.newLine,
            getSourceFile: (fileName, languageVersionOrOptions) => {
                if (sys.fileExists(fileName)) {
                    const contents = sys.readFile(fileName);
                    if (contents && typeof contents === "string") {
                        return ts.createSourceFile(
                            fileName,
                            contents,
                            languageVersionOrOptions,
                            false
                        );
                    }
                }
                return undefined;
            },
            useCaseSensitiveFileNames: () => sys.useCaseSensitiveFileNames,
        },
        updateFile: (sourceFile) => {
            sys.writeFile(sourceFile.fileName, sourceFile.text);
            return true;
        },
        deleteFile: (sourceFile) => {
            sys.deleteFile!(sourceFile.fileName);
            return true;
        },
    };
    return vHost;
}
