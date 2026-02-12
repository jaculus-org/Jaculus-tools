import { BOARD_INDEX_URL, BOARD_VERSIONS_JSON, BOARDS_INDEX_JSON } from "./config.js";

export type BoardVariant = {
    name: string;
    id: string;
};

export type BoardsIndex = {
    chip: string;
    variants: BoardVariant[];
};

export type BoardVersion = {
    version: string;
};

export async function getBoardsIndex(): Promise<BoardsIndex[]> {
    try {
        const response = fetch(`${BOARD_INDEX_URL}/${BOARDS_INDEX_JSON}`);
        const res = await response;
        return await res.json();
    } catch (e) {
        console.error(e);
        return [];
    }
}

export async function getBoardVersions(boardId: string): Promise<BoardVersion[]> {
    try {
        const response = fetch(`${BOARD_INDEX_URL}/${boardId}/${BOARD_VERSIONS_JSON}`);
        const res = await response;
        return await res.json();
    } catch (e) {
        console.error(e);
        return [];
    }
}

export function getBoardVersionFirmwareTarUrl(boardId: string, version: string): string {
    return `${BOARD_INDEX_URL}/${boardId}/${boardId}-${version}.tar.gz`;
}
