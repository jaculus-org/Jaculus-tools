export class ProjectError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProjectError";
    }
}

export class ProjectFetchError extends ProjectError {
    constructor(message: string) {
        super(message);
        this.name = "ProjectFetchError";
    }
}

export class ProjectDependencyError extends ProjectError {
    constructor(message: string) {
        super(message);
        this.name = "ProjectDependencyError";
    }
}
