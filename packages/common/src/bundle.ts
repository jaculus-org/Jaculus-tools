export interface ProjectBundle {
    dirs: Set<string>;
    files: Record<string, Uint8Array>;
}
