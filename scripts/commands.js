import { readFile, writeFile, normalizePath } from "./filesystem.js";

function tokenize(commandLine) {
    const tokens = [];
    let token = "";
    let quote = null;
    let tokenStarted = false;

    const finishToken = () => {
        if (!tokenStarted) return;
        tokens.push(token);
        token = "";
        tokenStarted = false;
    };

    for (let i = 0; i < commandLine.length; i++) {
        const char = commandLine[i];
        if (char === "\\" && quote !== "'") {
            if (i + 1 < commandLine.length) token += commandLine[++i];
            tokenStarted = true;
        } else if (quote) {
            if (char === quote) quote = null;
            else token += char;
            tokenStarted = true;
        } else if (char === "'" || char === '"') {
            quote = char;
            tokenStarted = true;
        } else if (char === ">") {
            finishToken();
            tokens.push(">");
        } else if (/\s/.test(char)) {
            finishToken();
        } else {
            token += char;
            tokenStarted = true;
        }
    }

    if (quote) throw new Error("shell: unmatched quote");
    finishToken();
    return tokens;
}

function resolvePath(path, cwd) {
    if (path === "~") return normalizePath(window.Environment.HOME || "/root");
    if (path.startsWith("~/")) return normalizePath(`${window.Environment.HOME || "/root"}/${path.slice(2)}`);
    return normalizePath(path.startsWith("/") ? path : `${cwd}/${path}`);
}

async function exec(commandLine, cwd = "/root") {
    const tokens = tokenize(commandLine);
    const redirectIndex = tokens.indexOf(">");
    let redirectPath;
    let commandTokens = tokens;

    if (redirectIndex !== -1) {
        if (tokens.indexOf(">", redirectIndex + 1) !== -1 || redirectIndex !== tokens.length - 2) {
            throw new Error("shell: expected one output file after >");
        }
        redirectPath = resolvePath(tokens[redirectIndex + 1], cwd);
        commandTokens = tokens.slice(0, redirectIndex);
    }

    const [command, ...args] = commandTokens;
    if (!command) return { output: "", cwd };

    let scriptPath;
    for (const directory of ["/usr/bin", "/usr/sbin", "/etc"]) {
        try {
            scriptPath = await readFile(`${directory}/${command}`);
            break;
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }
    if (scriptPath === undefined) throw new Error(`${command}: command not found`);

    // Command files name trusted ES modules shipped with the simulator.
    if (typeof scriptPath !== "string" || !/^\.\/(bin|sbin|etc)\/[\w-]+(\.js)?$/.test(scriptPath)) {
        throw new Error(`${command}: invalid command script`);
    }
    const { default: run } = await import(new URL(scriptPath, import.meta.url));
    if (typeof run !== "function") throw new Error(`${command}: command script has no default function`);

    const result = await run({ args, cwd, resolvePath });
    const output = typeof result === "string" ? result : result?.output ?? "";
    const nextCwd = typeof result === "string" ? cwd : result?.cwd ?? cwd;

    if (redirectPath) {
        await writeFile(redirectPath, output);
        return { output: "", cwd: nextCwd };
    }
    return { output, cwd: nextCwd, halt: result?.halt ?? false };
}

export { exec };
