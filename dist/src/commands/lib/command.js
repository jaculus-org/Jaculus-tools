function tableToString(table, options = {}) {
    const padding = options.padding ?? 2;
    const indent = options.indent ?? 0;
    const minWidths = options.minWidths ?? [];
    const columnWidths = [];
    let out = "";
    for (const row of table) {
        for (let i = 0; i < row.length; i++) {
            if (columnWidths[i] === undefined) {
                columnWidths[i] = minWidths[i] ?? 0;
            }
            columnWidths[i] = Math.max(columnWidths[i], row[i].length);
        }
    }
    for (const row of table) {
        out += " ".repeat(indent);
        for (let i = 0; i < row.length; i++) {
            out += row[i].padEnd(columnWidths[i] + padding);
        }
        out += "\n";
    }
    return out;
}
function getOptName(arg) {
    if (!arg.startsWith("-")) {
        return null;
    }
    if (arg.startsWith("--")) {
        return arg.slice(2);
    }
    if (arg.startsWith("-") && arg.length === 2) {
        return arg.slice(1);
    }
    return null;
}
function parseArgs(argv, base = {}, expOpts, expArgs) {
    const unknown = [];
    const options = { ...base };
    const argsList = [];
    for (let i = 0; i < argv.length; i++) {
        let optName = getOptName(argv[i]);
        if (optName === null) {
            if (argsList.length < expArgs.length) {
                argsList.push(argv[i]);
            }
            else {
                unknown.push(argv[i]);
            }
            continue;
        }
        let value = undefined;
        if (optName.includes("=")) {
            const [n, v] = optName.split("=", 2);
            optName = n;
            value = v;
        }
        if (optName in expOpts) {
            if (optName in options) {
                throw new Error(`Option --${optName} was specified multiple times`);
            }
            if (expOpts[optName].isFlag) {
                if (value !== undefined) {
                    throw new Error(`Option --${optName} is a flag and does not accept a value`);
                }
                options[optName] = true;
                continue;
            }
            if (value !== undefined) {
                options[optName] = value;
                continue;
            }
            if (i + 1 >= argv.length) {
                throw new Error(`Option --${optName} requires a value`);
            }
            options[optName] = argv[i + 1];
            i++;
            continue;
        }
        else if (argsList.length < expArgs.length) {
            throw new Error(`Unknown option ${optName}`);
        }
        unknown.push(argv[i]);
    }
    for (const [name, opt] of Object.entries(expOpts)) {
        if (name in options) {
            if (opt.validator && !opt.validator(options[name])) {
                throw new Error(`Option ${name} has an invalid value`);
            }
            continue;
        }
        if (opt.isFlag) {
            options[name] = false;
            continue;
        }
        if (opt.defaultValue !== undefined) {
            options[name] = opt.defaultValue;
            continue;
        }
        if (opt.required) {
            throw new Error(`Option ${name} is required`);
        }
    }
    for (const [i, arg] of expArgs.entries()) {
        if (i < argsList.length) {
            if (arg.validator && !arg.validator(argsList[i])) {
                throw new Error(`Argument ${arg.name} has an invalid value`);
            }
            continue;
        }
        if (arg.defaultValue !== undefined) {
            argsList[i] = arg.defaultValue;
            continue;
        }
        if (arg.required) {
            throw new Error(`Argument ${arg.name} is required`);
        }
    }
    const args = {};
    for (let i = 0; i < expArgs.length; i++) {
        args[expArgs[i].name] = argsList[i];
    }
    return { options, args, unknown };
}
export class Opt {
    constructor(description, options = {}) {
        this.description = description;
        this.required = options.required ?? false;
        this.isFlag = options.isFlag ?? false;
        this.defaultValue = options.defaultValue;
        this.validator = options.validator;
    }
}
export class Arg {
    constructor(name, description, options = {}) {
        this.name = name;
        this.description = description;
        this.required = options.required ?? false;
        this.defaultValue = options.defaultValue;
        this.validator = options.validator;
    }
}
export class Command {
    constructor(brief, options = {}) {
        this.options = {};
        this.chainable = false;
        this.args = [];
        this.options = options.options ?? {};
        this.args = options.args ?? [];
        this.action = options.action;
        this.description = options.description;
        this.chainable = options.chainable ?? false;
        this.brief = brief;
    }
    help(command) {
        let args = "";
        for (const arg of this.args) {
            if (arg.required) {
                args += ` <${arg.name}>`;
            }
            else {
                args += ` [${arg.name}]`;
            }
        }
        let help = `Usage: ${command} [OPTIONS]${args}\n\n`;
        help += `${this.brief}\n\n`;
        if (this.description) {
            help += `${this.description}\n\n`;
        }
        let table = [];
        for (const [name, opt] of Object.entries(this.options)) {
            const desc = opt.description + (opt.defaultValue ? ` (default: ${opt.defaultValue})` : "");
            table.push([`--${name}`, desc]);
        }
        if (table.length > 0) {
            help += "Options:\n";
            help += tableToString(table, { padding: 2, indent: 2, minWidths: [12] });
        }
        table = [];
        for (const arg of this.args) {
            const desc = arg.description + (arg.defaultValue ? ` (default: ${arg.defaultValue})` : "");
            table.push([arg.name, desc]);
        }
        if (table.length > 0) {
            help += "Arguments:\n";
            help += tableToString(table, { padding: 2, indent: 2, minWidths: [12] });
        }
        return help;
    }
    async run(argv, globals, env) {
        const { options, args, unknown } = parseArgs(argv, globals, this.options, this.args);
        if (this.action) {
            await this.action(options, args, env);
        }
        return unknown;
    }
    validate(argv, globals) {
        const { unknown } = parseArgs(argv, globals, this.options, this.args);
        return unknown;
    }
}
export class Program {
    constructor(name, description, options = {}) {
        this.commands = {};
        this.globalOptions = {};
        this.env = {};
        this.name = name;
        this.description = description;
        this.globalOptions = options.globalOptions ?? {};
        this.action = options.action;
    }
    addCommand(name, command) {
        this.commands[name] = command;
    }
    getCommand(name) {
        return this.commands[name];
    }
    help() {
        let out = `Usage: ${this.name} <command>\n\n`;
        out += `${this.description}\n\n`;
        out += "Commands:\n";
        let table = [];
        for (const [name, command] of Object.entries(this.commands)) {
            table.push([name, command.brief]);
        }
        out += tableToString(table, { padding: 2, indent: 2, minWidths: [12] });
        out += "\nGlobal options:\n";
        table = [];
        for (const [name, opt] of Object.entries(this.globalOptions)) {
            const desc = opt.description + (opt.defaultValue ? ` (default: ${opt.defaultValue})` : "");
            table.push([`--${name}`, desc]);
        }
        out += tableToString(table, { padding: 2, indent: 2, minWidths: [12] });
        return out;
    }
    async runInternal(argv, globals = {}) {
        if (argv.length === 0) {
            throw new Error("No command specified");
        }
        const commandName = argv[0];
        const command = this.commands[commandName];
        if (command === undefined) {
            throw new Error(`Unknown command ${commandName}`);
        }
        return command.run(argv.slice(1), globals, this.env);
    }
    async runSingle(argv, globals = {}) {
        this.validateSingle(argv, globals);
        if (this.action) {
            await this.action(globals);
        }
        return this.runInternal(argv, globals);
    }
    validateSingle(argv, globals = {}) {
        const { unknown } = parseArgs(argv, globals, this.globalOptions, []);
        if (unknown.length === 0) {
            return;
        }
        const commandName = unknown[0];
        const command = this.commands[commandName];
        if (command === undefined) {
            throw new Error(`Unknown command ${commandName}`);
        }
        const remaining = command.validate(unknown.slice(1), globals);
        if (remaining.length > 0) {
            throw new Error(`Unknown option ${remaining[0]}`);
        }
    }
    async runChain(argv, globals = {}) {
        const res = parseArgs(argv, globals, this.globalOptions, []);
        let unknown = res.unknown;
        const options = res.options;
        this.validateChain(unknown, options);
        if (this.action) {
            await this.action(globals);
        }
        unknown = await this.runInternal(unknown, options);
        while (unknown.length > 0) {
            unknown = await this.runInternal(unknown, options);
        }
    }
    validateChain(argv, globals = {}) {
        let { unknown } = parseArgs(argv, globals, this.globalOptions, []);
        if (unknown.length === 0) {
            return;
        }
        while (unknown.length > 0) {
            const commandName = unknown[0];
            const command = this.commands[commandName];
            if (command === undefined) {
                if (commandName.startsWith("-")) {
                    throw new Error(`Unknown option ${commandName}`);
                }
                else {
                    throw new Error(`Unknown command ${commandName}`);
                }
            }
            if (!command.chainable) {
                throw new Error(`Command ${commandName} is not chainable`);
            }
            unknown = command.validate(unknown.slice(1), globals);
        }
    }
    async run(argv, globals = {}) {
        const { options, unknown } = parseArgs(argv, globals, this.globalOptions, []);
        if (unknown.length === 0) {
            throw new Error("Command not specified");
        }
        const commandName = unknown[0];
        const command = this.commands[commandName];
        if (command === undefined) {
            throw new Error(`Unknown command ${commandName}`);
        }
        if (command.chainable) {
            await this.runChain(unknown, options);
            return;
        }
        await this.runSingle(unknown, options);
    }
    end() {
        for (const [, { value, onEnd }] of Object.entries(this.env)) {
            onEnd(value);
        }
    }
}
//# sourceMappingURL=command.js.map