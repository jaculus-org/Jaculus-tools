type System = import("typescript").System;
type CompilerOptions = import("typescript").CompilerOptions;
type CompilerHost = import("typescript").CompilerHost;
type SourceFile = import("typescript").SourceFile;
type TS = typeof import("typescript");

// type CustomTransformers = import("typescript").CustomTransformers;
// type LanguageServiceHost = import("typescript").LanguageServiceHost;

import path from "path";
import ts from "typescript";

const shouldDebug = false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const debugLog = shouldDebug ? console.log : (_message?: any, ..._optionalParams: any[]) => "";

// export interface VirtualTypeScriptEnvironment {
//     sys: System;
//     languageService: import("typescript").LanguageService;
//     getSourceFile: (fileName: string) => import("typescript").SourceFile | undefined;
//     createFile: (fileName: string, content: string) => void;
//     updateFile: (
//         fileName: string,
//         content: string,
//         replaceTextSpan?: import("typescript").TextSpan
//     ) => void;
//     deleteFile: (fileName: string) => void;
// }

// /**
//  * Makes a virtual copy of the TypeScript environment. This is the main API you want to be using with
//  * @typescript/vfs. A lot of the other exposed functions are used by this function to get set up.
//  *
//  * @param sys an object which conforms to the TS Sys (a shim over read/write access to the fs)
//  * @param rootFiles a list of files which are considered inside the project
//  * @param ts a copy pf the TypeScript module
//  * @param compilerOptions the options for this compiler run
//  * @param customTransformers custom transformers for this compiler run
//  */
// export function createVirtualTypeScriptEnvironment(
//     sys: System,
//     rootFiles: string[],
//     ts: TS,
//     typescriptLibPath: string,
//     compilerOptions: CompilerOptions = {},
//     customTransformers?: CustomTransformers
// ): VirtualTypeScriptEnvironment {
//     const mergedCompilerOpts = { ...compilerOptions };

//     const { languageServiceHost, updateFile, deleteFile } = createVirtualLanguageServiceHost(
//         sys,
//         rootFiles,
//         mergedCompilerOpts,
//         ts,
//         typescriptLibPath,
//         customTransformers,
//     );
//     const languageService = ts.createLanguageService(languageServiceHost);
//     const diagnostics = languageService.getCompilerOptionsDiagnostics();

//     if (diagnostics.length) {
//         const compilerHost = createVirtualCompilerHost(sys, compilerOptions, ts, typescriptLibPath);
//         throw new Error(ts.formatDiagnostics(diagnostics, compilerHost.compilerHost));
//     }

//     return {
//         sys,
//         languageService,
//         getSourceFile: (fileName) => languageService.getProgram()?.getSourceFile(fileName),

//         createFile: (fileName, content) => {
//             updateFile(ts.createSourceFile(fileName, content, mergedCompilerOpts.target!, false));
//         },
//         updateFile: (fileName, content, optPrevTextSpan) => {
//             const prevSourceFile = languageService.getProgram()!.getSourceFile(fileName);
//             if (!prevSourceFile) {
//                 throw new Error("Did not find a source file for " + fileName);
//             }
//             const prevFullContents = prevSourceFile.text;

//             // TODO: Validate if the default text span has a fencepost error?
//             const prevTextSpan = optPrevTextSpan ?? ts.createTextSpan(0, prevFullContents.length);
//             const newText =
//                 prevFullContents.slice(0, prevTextSpan.start) +
//                 content +
//                 prevFullContents.slice(prevTextSpan.start + prevTextSpan.length);
//             const newSourceFile = ts.updateSourceFile(prevSourceFile, newText, {
//                 span: prevTextSpan,
//                 newLength: content.length,
//             });

//             updateFile(newSourceFile);
//         },
//         deleteFile(fileName) {
//             const sourceFile = languageService.getProgram()!.getSourceFile(fileName);
//             if (sourceFile) {
//                 deleteFile(sourceFile);
//             }
//         },
//     };
// }

// /**
//  * Sets up a Map with lib contents by grabbing the necessary files from
//  * the local copy of typescript via the file system.
//  *
//  * The first two args are un-used, but kept around so as to not cause a
//  * semver major bump for no gain to module users.
//  */
// export const initializeTypeScriptLibs = (
//     sourceFs: typeof import("fs"),
//     system: System
// ) => {
//     const typescriptLibPathNode = path.dirname(fileURLToPath(import.meta.resolve?.("typescript")!));
//     const typescriptLibPathVfs = path.join("node_modules", "typescript", "lib");

//     const source = sourceFs.readdirSync(typescriptLibPathNode);
//     if (source.length === 0) {
//         throw new Error(
//             `TSVFS: Could not find the TypeScript lib files at ${typescriptLibPathNode}. Please ensure that TypeScript is installed.`
//         );
//     }

//     source.forEach((lib) => {
//         if (!lib.startsWith("lib.webworker.") && lib.startsWith("lib.") && lib.endsWith(".d.ts")) {
//             if (!system.directoryExists(typescriptLibPathVfs)) {
//                 system.createDirectory(typescriptLibPathVfs);
//             }
//             const content = sourceFs.readFileSync(path.join(typescriptLibPathNode, lib), "utf8");
//             system.writeFile(path.join(typescriptLibPathVfs, lib), content);
//         }
//     });
// };

// /**
//  * Adds recursively files from the FS into the map based on the folder
//  */
// export const addAllFilesFromFolder = (map: Map<string, string>, workingDir: string): void => {
//     const walk = function (dir: string) {
//         let results: string[] = [];
//         const list = fs.readdirSync(dir);
//         list.forEach(function (file: string) {
//             file = path.join(dir, file);
//             const stat = fs.statSync(file);
//             if (stat && stat.isDirectory()) {
//                 /* Recurse into a subdirectory */
//                 results = results.concat(walk(file));
//             } else {
//                 /* Is a file */
//                 results.push(file);
//             }
//         });
//         return results;
//     };

//     const allFiles = walk(workingDir);

//     allFiles.forEach((lib) => {
//         const fsPath = "/node_modules/@types" + lib.replace(workingDir, "");
//         const content = fs.readFileSync(lib, "utf8");
//         const validExtensions = [".ts", ".tsx"];

//         if (validExtensions.includes(path.extname(fsPath))) {
//             map.set(fsPath, content);
//         }
//     });
// };

// /** Adds all files from node_modules/@types into the FS Map */
// export const addFilesForTypesIntoFolder = (map: Map<string, string>) =>
//     addAllFilesFromFolder(map, "node_modules/@types");

// export interface LZString {
//     compressToUTF16(input: string): string;
//     decompressFromUTF16(compressed: string): string;
// }

// /**
//  * Create a virtual FS Map with the lib files from a particular TypeScript
//  * version based on the target, Always includes dom ATM.
//  *
//  * @param options The compiler target, which dictates the libs to set up
//  * @param version the versions of TypeScript which are supported
//  * @param cache should the values be stored in local storage
//  * @param ts a copy of the typescript import
//  * @param lzstring an optional copy of the lz-string import
//  * @param fetcher an optional replacement for the global fetch function (tests mainly)
//  * @param storer an optional replacement for the localStorage global (tests mainly)
//  */
// export const createDefaultMapFromCDN = (
//     options: CompilerOptions,
//     version: string,
//     cache: boolean,
//     ts: TS
// ) => {
//     const fetchlike = fetch!;
//     const fsMap = new Map<string, string>();
//     const files = knownLibFilesForCompilerOptions(options, ts);
//     const prefix = `https://playgroundcdn.typescriptlang.org/cdn/${version}/typescript/lib/`;

//     // Map the known libs to a node fetch promise, then return the contents
//     function uncached() {
//         return (
//             Promise.all(files.map((lib) => fetchlike(prefix + lib).then((resp) => resp.text())))
//                 .then((contents) => {
//                     contents.forEach((text, index) => fsMap.set("/" + files[index], text));
//                 })
//                 // Return a NOOP for .d.ts files which aren't in the current build of TypeScript
//                 .catch(() => {})
//         );
//     }

//     return uncached().then(() => fsMap);
// };

function notImplemented(methodName: string): any {
    throw new Error(`Method '${methodName}' is not implemented.`);
}

function audit<ArgsT extends any[], ReturnT>(
    name: string,
    fn: (...args: ArgsT) => ReturnT
): (...args: ArgsT) => ReturnT {
    return (...args) => {
        const res = fn(...args);

        const smallres = typeof res === "string" ? res.slice(0, 80) + "..." : res;
        debugLog("> " + name, ...args);
        debugLog("< " + smallres);

        return res;
    };
}

/**
 * Creates an in-memory System object which can be used in a TypeScript program, this
 * is what provides read/write aspects of the virtual fs
 */
export function createSystem(fsVirtual: typeof import("fs"), preFix: string): System {
    const resolveVirtualPath = (inputPath: string) =>
        path.isAbsolute(inputPath) ? path.normalize(inputPath) : path.join(preFix, inputPath);

    const toRelativeFromPrefix = (absolutePath: string) =>
        path.relative(preFix, path.normalize(absolutePath));

    return {
        args: [],
        createDirectory: audit("createDirectory", (dirName) =>
            fsVirtual.mkdirSync(resolveVirtualPath(dirName), { recursive: true })
        ),
        directoryExists: audit("directoryExists", (directory) => {
            return fsVirtual.existsSync(resolveVirtualPath(directory));
        }),
        exit: () => notImplemented("exit"),
        fileExists: audit("fileExists", (fileName) =>
            fsVirtual.existsSync(resolveVirtualPath(fileName))
        ),
        getCurrentDirectory: () => preFix,
        getDirectories: audit("getDirectories", (directory) => {
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
        }),
        getExecutingFilePath: () => notImplemented("getExecutingFilePath"),
        readDirectory: audit(
            "readDirectory",
            (directory, extensions, excludes, includes, depth) => {
                const absoluteDir = resolveVirtualPath(directory);

                // ts.matchFiles is an internal API not exposed in types, but it exists
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
            }
        ),
        readFile: audit("readFile", (fileName) =>
            fsVirtual.readFileSync(resolveVirtualPath(fileName), "utf-8")
        ),
        resolvePath: (filePath) => path.normalize(filePath),
        newLine: "\n",
        useCaseSensitiveFileNames: true,
        write: () => notImplemented("write"),
        writeFile: audit("writeFile", (fileName, contents) => {
            const fullPath = resolveVirtualPath(fileName);
            const dir = path.dirname(fullPath);
            fsVirtual.mkdirSync(dir, { recursive: true });
            fsVirtual.writeFileSync(fullPath, contents, "utf-8");
        }),
        deleteFile: audit("deleteFile", (fileName) => {
            fsVirtual.unlinkSync(resolveVirtualPath(fileName));
        }),
    };
}

// /**
//  * Creates a file-system backed System object which can be used in a TypeScript program, you provide
//  * a set of virtual files which are prioritised over the FS versions, then a path to the root of your
//  * project (basically the folder your node_modules lives)
//  */
// export function createFSBackedSystem(
//     files: Map<string, string>,
//     _projectRoot: string,
//     ts: TS,
//     tsLibDirectory?: string
// ): System {
//     // We need to make an isolated folder for the tsconfig, but also need to be able to resolve the
//     // existing node_modules structures going back through the history
//     const root = _projectRoot + "/vfs";

//     // The default System in TypeScript
//     const nodeSys = ts.sys;
//     const tsLib = tsLibDirectory ?? path.dirname(require.resolve("typescript"));

//     return {
//         args: [],
//         createDirectory: () => notImplemented("createDirectory"),
//         // TODO: could make a real file tree
//         directoryExists: audit("directoryExists", (directory) => {
//             return (
//                 Array.from(files.keys()).some((path) => path.startsWith(directory)) ||
//                 nodeSys.directoryExists(directory)
//             );
//         }),
//         exit: nodeSys.exit,
//         fileExists: audit("fileExists", (fileName) => {
//             if (files.has(fileName)) return true;
//             // Don't let other tsconfigs end up touching the vfs
//             if (fileName.includes("tsconfig.json") || fileName.includes("tsconfig.json"))
//                 return false;
//             if (fileName.startsWith("/lib")) {
//                 const tsLibName = `${tsLib}/${fileName.replace("/", "")}`;
//                 return nodeSys.fileExists(tsLibName);
//             }
//             return nodeSys.fileExists(fileName);
//         }),
//         getCurrentDirectory: () => root,
//         getDirectories: nodeSys.getDirectories,
//         getExecutingFilePath: () => notImplemented("getExecutingFilePath"),
//         readDirectory: audit("readDirectory", (...args) => {
//             if (args[0] === "/") {
//                 return Array.from(files.keys());
//             } else {
//                 return nodeSys.readDirectory(...args);
//             }
//         }),
//         readFile: audit("readFile", (fileName) => {
//             if (files.has(fileName)) return files.get(fileName);
//             if (fileName.startsWith("/lib")) {
//                 const tsLibName = `${tsLib}/${fileName.replace("/", "")}`;
//                 const result = nodeSys.readFile(tsLibName);
//                 if (!result) {
//                     const libs = nodeSys.readDirectory(tsLib);
//                     throw new Error(
//                         `TSVFS: A request was made for ${tsLibName} but there wasn't a file found in the file map. You likely have a mismatch in the compiler options for the CDN download vs the compiler program. Existing Libs: ${libs}.`
//                     );
//                 }
//                 return result;
//             }
//             return nodeSys.readFile(fileName);
//         }),
//         resolvePath: (path) => {
//             if (files.has(path)) return path;
//             return nodeSys.resolvePath(path);
//         },
//         newLine: "\n",
//         useCaseSensitiveFileNames: true,
//         write: () => notImplemented("write"),
//         writeFile: (fileName, contents) => {
//             files.set(fileName, contents);
//         },
//         deleteFile: (fileName) => {
//             files.delete(fileName);
//         },
//         realpath: nodeSys.realpath,
//     };
// }

/**
 * Creates an in-memory CompilerHost -which is essentially an extra wrapper to System
 * which works with TypeScript objects - returns both a compiler host, and a way to add new SourceFile
 * instances to the in-memory file system.
 */

/**
 * Creates CompilerHost using the provided System object and path to the TypeScript lib files
 * Everything has to be accessible via the System object (it shares the same file system)
 */
export function createVirtualCompilerHost(
    sys: System,
    compilerOptions: CompilerOptions,
    ts: TS,
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
            getDefaultLibLocation: () => {
                return typescriptLibPath!;
            },
            getNewLine: () => sys.newLine,
            getSourceFile: (fileName, languageVersionOrOptions) => {
                // if exists in sys, use that
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

// /**
//  * Creates an object which can host a language service against the virtual file-system
//  */
// export function createVirtualLanguageServiceHost(
//     sys: System,
//     rootFiles: string[],
//     compilerOptions: CompilerOptions,
//     ts: TS,
//     typescriptLibPath: string,
//     customTransformers?: CustomTransformers
// ) {
//     const fileNames = [...rootFiles];
//     const { compilerHost, updateFile, deleteFile } = createVirtualCompilerHost(
//         sys,
//         compilerOptions,
//         ts,
//         typescriptLibPath
//     );
//     const fileVersions = new Map<string, string>();
//     let projectVersion = 0;
//     const languageServiceHost: LanguageServiceHost = {
//         ...compilerHost,
//         getProjectVersion: () => projectVersion.toString(),
//         getCompilationSettings: () => compilerOptions,
//         getCustomTransformers: () => customTransformers,
//         // A couple weeks of 4.8 TypeScript nightlies had a bug where the Program's
//         // list of files was just a reference to the array returned by this host method,
//         // which means mutations by the host that ought to result in a new Program being
//         // created were not detected, since the old list of files and the new list of files
//         // were in fact a reference to the same underlying array. That was fixed in
//         // https://github.com/microsoft/TypeScript/pull/49813, but since the twoslash runner
//         // is used in bisecting for changes, it needs to guard against being busted in that
//         // couple-week period, so we defensively make a slice here.
//         getScriptFileNames: () => fileNames.slice(),
//         getScriptSnapshot: (fileName) => {
//             const contents = sys.readFile(fileName);
//             if (contents && typeof contents === "string") {
//                 return ts.ScriptSnapshot.fromString(contents);
//             }
//             return;
//         },
//         getScriptVersion: (fileName) => {
//             return fileVersions.get(fileName) || "0";
//         },
//         writeFile: sys.writeFile,
//     };

//     type Return = {
//         languageServiceHost: LanguageServiceHost;
//         updateFile: (sourceFile: import("typescript").SourceFile) => void;
//         deleteFile: (sourceFile: import("typescript").SourceFile) => void;
//     };

//     const lsHost: Return = {
//         languageServiceHost,
//         updateFile: (sourceFile) => {
//             projectVersion++;
//             fileVersions.set(sourceFile.fileName, projectVersion.toString());
//             if (!fileNames.includes(sourceFile.fileName)) {
//                 fileNames.push(sourceFile.fileName);
//             }
//             updateFile(sourceFile);
//         },
//         deleteFile: (sourceFile) => {
//             projectVersion++;
//             fileVersions.set(sourceFile.fileName, projectVersion.toString());
//             const index = fileNames.indexOf(sourceFile.fileName);
//             if (index !== -1) {
//                 fileNames.splice(index, 1);
//             }
//             deleteFile(sourceFile);
//         },
//     };
//     return lsHost;
// }
