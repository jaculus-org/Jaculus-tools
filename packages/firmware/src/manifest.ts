import { z } from "zod";

const PartitionSchema = z.object({
    name: z.string(),
    address: z.string(),
    file: z.string(),
    isStorage: z.boolean().optional(),
});

const ManifestConfigSchema = z.object({
    chip: z.string(),
    flashBaud: z.number().optional(),
    partitions: z.array(PartitionSchema),
});

const ManifestDataSchema = z.object({
    board: z.string(),
    version: z.string(),
    platform: z.string(),
    config: ManifestConfigSchema,
});

export type Partition = z.infer<typeof PartitionSchema>;
export type ManifestConfig = z.infer<typeof ManifestConfigSchema>;

export type Manifest = Readonly<{
    board: string;
    version: string;
    platform: string;
    config: ManifestConfig;
}>;

/**
 * Parse the manifest file
 * @param data Manifest file data
 * @returns The manifest
 */
export function parseManifest(data: string): Manifest {
    const parsed = ManifestDataSchema.parse(JSON.parse(data));
    return Object.freeze(parsed);
}
