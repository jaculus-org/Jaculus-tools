import { z } from "zod";

const BOARD_INDEX_URL = "https://f.jaculus.org/bin";
const BOARDS_INDEX_JSON = "boards.json";
const BOARD_VERSIONS_JSON = "versions.json";

const BoardVariantSchema = z.object({
    name: z.string(),
    id: z.string(),
});

const BoardsIndexSchema = z.object({
    chip: z.string(),
    variants: z.array(BoardVariantSchema),
});

const BoardVersionSchema = z.object({
    version: z.string(),
});

export type BoardVariant = z.infer<typeof BoardVariantSchema>;
export type BoardsIndex = z.infer<typeof BoardsIndexSchema>;
export type BoardVersion = z.infer<typeof BoardVersionSchema>;

export async function getBoardsIndex(): Promise<BoardsIndex[]> {
    try {
        const response = fetch(`${BOARD_INDEX_URL}/${BOARDS_INDEX_JSON}`);
        const res = await response;
        const data = await res.json();
        const parsed = z.array(BoardsIndexSchema).safeParse(data);
        if (!parsed.success) {
            console.error("Failed to parse boards index:", z.prettifyError(parsed.error));
            return [];
        }
        return parsed.data;
    } catch (e) {
        console.error(e);
        return [];
    }
}

export async function getBoardVersions(boardId: string): Promise<BoardVersion[]> {
    try {
        const response = fetch(`${BOARD_INDEX_URL}/${boardId}/${BOARD_VERSIONS_JSON}`);
        const res = await response;
        const data = await res.json();
        const parsed = z.array(BoardVersionSchema).safeParse(data);
        if (!parsed.success) {
            console.error("Failed to parse board versions:", z.prettifyError(parsed.error));
            return [];
        }
        return parsed.data;
    } catch (e) {
        console.error(e);
        return [];
    }
}

export function getBoardVersionFirmwareTarUrl(boardId: string, version: string): string {
    return `${BOARD_INDEX_URL}/${boardId}/${boardId}-${version}.tar.gz`;
}
