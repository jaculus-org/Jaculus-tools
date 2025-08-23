
export function encodePath(path_: string, nullTerminate = true): Buffer {
    const data = Buffer.alloc(path_.length + (nullTerminate ? 1 : 0));
    for (let i = 0; i < path_.length; i++) {
        data[i] = path_.charCodeAt(i);
    }
    if (nullTerminate) {
        data[path_.length] = 0;
    }
    return data;
}
