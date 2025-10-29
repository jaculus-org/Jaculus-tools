import * as z from "zod";
import path from "path";
import { FSInterface } from "../fs/index.js";

// package.json like definition for libraries

// name: npm package name pattern (allows scoped packages like @org/name)
// Got from: https://github.com/SchemaStore/schemastore/tree/d2684d4406cb26c254dffde1f43b5d1ee51c531a/src/schemas/json/package.json#L349-L354
const NameSchema = z
    .string()
    .min(1)
    .max(214)
    .regex(/^(?:(?:@(?:[a-z0-9-*~][a-z0-9-*._~]*)?\/[a-z0-9-._~])|[a-z0-9-~])[a-z0-9-._~]*$/);

// version: semver (1.0.0, 0.1.0, 0.0.1, 1.0.0-beta, etc)
const VersionSchema = z
    .string()
    .min(1)
    .regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/);

const DescriptionSchema = z.string();

// dependencies: optional record of name -> version
// - in first version, only exact versions are supported
const DependenciesSchema = z.record(NameSchema, VersionSchema);

const JacLyFilesSchema = z.array(z.string());

const RegistryUrisSchema = z.array(z.string());

const PackageJsonSchema = z.object({
    name: NameSchema.optional(),
    version: VersionSchema.optional(),
    description: DescriptionSchema.optional(),
    dependencies: DependenciesSchema.default({}),
    jacly: JacLyFilesSchema.optional(),
    registry: RegistryUrisSchema.optional(),
});

export type Dependency = {
    name: string;
    version: string;
};
export type Dependencies = z.infer<typeof DependenciesSchema>;
export type JacLyFiles = z.infer<typeof JacLyFilesSchema>;
export type RegistryUris = z.infer<typeof RegistryUrisSchema>;
export type PackageJson = z.infer<typeof PackageJsonSchema>;

export async function parsePackageJson(json: any): Promise<PackageJson> {
    const result = await PackageJsonSchema.safeParseAsync(json);
    if (!result.success) {
        const pretty = z.prettifyError(result.error);
        throw new Error(`Invalid package.json format:\n${pretty}`);
    }
    return result.data;
}

export async function loadPackageJson(
    fs: FSInterface,
    projectPath: string,
    fileName: string
): Promise<PackageJson> {
    const filePath = path.join(projectPath, fileName);
    const data = await fs.promises.readFile(filePath, { encoding: "utf-8" });
    const json = JSON.parse(data);
    return parsePackageJson(json);
}

export async function savePackageJson(
    fs: FSInterface,
    projectPath: string,
    fileName: string,
    pkg: PackageJson
): Promise<void> {
    const filePath = path.join(projectPath, fileName);
    const data = JSON.stringify(pkg, null, 4);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
    }

    await fs.promises.writeFile(filePath, data, { encoding: "utf-8" });
}
