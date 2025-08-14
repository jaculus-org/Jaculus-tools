export type Env = Record<string, {
    value: any;
    onEnd: (value: any) => void;
}>;
export declare class Opt {
    description: string;
    required: boolean;
    isFlag: boolean;
    defaultValue?: string;
    validator?: (value: string) => boolean;
    constructor(description: string, options?: {
        required?: boolean;
        isFlag?: boolean;
        defaultValue?: string;
        validator?: (value: string) => boolean;
    });
}
export declare class Arg {
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
    validator?: (value: string) => boolean;
    constructor(name: string, description: string, options?: {
        required?: boolean;
        defaultValue?: string;
        validator?: (value: string) => boolean;
    });
}
export declare class Command {
    private options;
    brief: string;
    description?: string;
    readonly chainable: boolean;
    private args;
    private action?;
    constructor(brief: string, options?: {
        options?: Record<string, Opt>;
        args?: Arg[];
        action?: (options: Record<string, string | boolean>, args: Record<string, string>, env: Env) => Promise<void>;
        description?: string;
        chainable?: boolean;
    });
    help(command: string): string;
    run(argv: string[], globals: Record<string, string | boolean>, env: Env): Promise<string[]>;
    validate(argv: string[], globals: Record<string, string | boolean>): string[];
}
export declare class Program {
    private commands;
    private name;
    private description;
    private globalOptions;
    private action?;
    env: Env;
    constructor(name: string, description: string, options?: {
        globalOptions?: Record<string, Opt>;
        action?: (options: Record<string, string | boolean>) => Promise<void>;
    });
    addCommand(name: string, command: Command): void;
    getCommand(name: string): Command | undefined;
    help(): string;
    private runInternal;
    private runSingle;
    private validateSingle;
    private runChain;
    private validateChain;
    run(argv: string[], globals?: Record<string, string | boolean>): Promise<void>;
    end(): void;
}
//# sourceMappingURL=command.d.ts.map