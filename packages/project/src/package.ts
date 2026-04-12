import * as z from "zod";
import path from "path";
import { FSInterface } from "./fs.js";

// name: npm package name pattern (allows scoped packages like @org/name)
// Got from: https://github.com/SchemaStore/schemastore/tree/d2684d4406cb26c254dffde1f43b5d1ee51c531a/src/schemas/json/package.json#L349-L354
const NameSchema = z
    .string()
    .min(1)
    .max(214)
    .regex(/^(?:(?:@(?:[a-z0-9-*~][a-z0-9-*._~]*)?\/[a-z0-9-._~])|[a-z0-9-~])[a-z0-9-._~]*$/);

// version: semver (1.0.0, 0.1.0, 0.0.1, 1.0.0-beta, etc)
const VersionFormat = z
    .string()
    .min(1)
    .regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/);

const DescriptionSchema = z.string();

// dependencies: record of package name to version (currently only exact version)
const DependenciesSchema = z.record(NameSchema, VersionFormat);
const RegistryUrisSchema = z.array(z.string());
export const JaculusProjectTypeSchema = z.enum(["code", "jacly"]);

const JaculusSchema = z
    .object({
        packageFormat: z.number().optional(),
        blocks: z.string().optional(),
        registry: RegistryUrisSchema.optional(),
        template: z.boolean().optional(),
        projectType: JaculusProjectTypeSchema.optional(),
        jaclyVersion: VersionFormat.optional(),
    })
    .catchall(z.unknown());

const ExportKeyValueSchema = z.record(z.string(), z.string());

const ExportsSchema = z.union([z.string(), ExportKeyValueSchema]);

const PackageJsonSchema = z
    .object({
        name: NameSchema,
        version: VersionFormat,
        description: DescriptionSchema.optional(),
        dependencies: DependenciesSchema.default({}),
        files: z.array(z.string()).optional(),
        type: z.enum(["module"]).optional(),
        main: z.string().optional(),
        scripts: z.record(z.string(), z.string()).optional(),
        exports: ExportsSchema.optional(),
        types: z.string().optional(),
        jaculus: JaculusSchema.optional(),
    })
    .catchall(z.unknown());

export type DependencyObject = {
    name: string;
    version: string;
};
export type Dependencies = z.infer<typeof DependenciesSchema>;
export type RegistryUris = z.infer<typeof RegistryUrisSchema>;
export type PackageJson = z.infer<typeof PackageJsonSchema>;
export type JaculusProjectType = z.infer<typeof JaculusProjectTypeSchema>;
export type JaculusConfig = z.infer<typeof JaculusSchema>;

export function projectJsonSchema() {
    return z.toJSONSchema(PackageJsonSchema, {});
}

export class InvalidPackageJsonFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidPackageJsonFormatError";
    }
}

export function parsePackageJson(json: unknown, filePathLog: string): PackageJson {
    const result = PackageJsonSchema.safeParse(json);
    if (!result.success) {
        const pretty = z.prettifyError(result.error);
        throw new InvalidPackageJsonFormatError(
            `Invalid package.json format at '${filePathLog}': ${pretty}`
        );
    }
    return result.data;
}

export async function loadPackageJson(fs: FSInterface, filePath: string): Promise<PackageJson> {
    const data = await fs.promises.readFile(filePath, { encoding: "utf-8" });
    let json: any;
    try {
        json = JSON.parse(data);
    } catch (error) {
        throw new InvalidPackageJsonFormatError(`Invalid JSON format: ${(error as Error).message}`);
    }
    return parsePackageJson(json, filePath);
}

export async function savePackageJson(
    fs: FSInterface,
    filePath: string,
    pkg: PackageJson
): Promise<void> {
    const data = JSON.stringify(pkg, null, 4);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
    }

    await fs.promises.writeFile(filePath, data, { encoding: "utf-8" });
}

export function splitLibraryNameVersion(library: string): { name: string; version: string | null } {
    const lastAtIndex = library.lastIndexOf("@");

    // No @ found or @ is at the beginning (scoped package without version)
    if (lastAtIndex <= 0) {
        return { name: library, version: null };
    }

    const name = library.substring(0, lastAtIndex);
    const version = library.substring(lastAtIndex + 1);

    return { name, version: version || null };
}

export function getPackagePath(projectPath: string, name: string): string {
    return path.join(projectPath, "node_modules", name);
}
