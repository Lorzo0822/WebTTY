// ===== filesystem.js =====
const DB_NAME = "WebTTY";
const DB_VERSION = 2;
const STORE_NAME = "files";
const BASE_URL = new URL(
    "../assets/base_filesystem.json",
    document.currentScript && document.currentScript.src ? document.currentScript.src : window.location.href
);

let baseFilesystem;
let db;
let initPromise;
let dbGeneration = 0;

function fsError(code, message = code) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
}

function normalizePath(path) {
    if (typeof path !== "string" || !path.startsWith("/")) throw fsError("EINVAL", "path must be absolute");
    const parts = [];
    for (const part of path.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") parts.pop();
        else parts.push(part);
    }
    return `/${parts.join("/")}`;
}

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        let wasBlocked = false;
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "filePath" });
        };
        request.onerror = () => reject(request.error || fsError("EIO", "could not open IndexedDB"));
        request.onblocked = () => {
            wasBlocked = true;
            reject(fsError("EBUSY", "IndexedDB upgrade is blocked"));
        };
        request.onsuccess = () => {
            const database = request.result;
            if (wasBlocked) { database.close(); return; }
            database.onversionchange = () => {
                database.close();
                dbGeneration++;
                if (db === database) {
                    db = null;
                    initPromise = null;
                }
            };
            resolve(database);
        };
    });
}

async function initFilesystem() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        const generation = dbGeneration;
        const response = await fetch(BASE_URL);
        if (!response.ok) throw fsError("EIO", `could not load base filesystem (${response.status})`);
        const loaded = await response.json();
        if (!loaded || !loaded["/"] || typeof loaded["/"] !== "object") throw fsError("EINVAL", "invalid base filesystem format");
        const database = await openDB();
        if (generation !== dbGeneration) {
            database.close();
            throw fsError("EBUSY", "database version changed during initialization; retry initFilesystem()");
        }
        baseFilesystem = loaded;
        db = database;
    })().catch(error => {
        if (!db) initPromise = null;
        throw error;
    });
    return initPromise;
}

function requireReady() {
    if (!db || !baseFilesystem) throw fsError("EINVAL", "filesystem is not initialized; call initFilesystem() first");
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || fsError("EIO"));
    });
}

function readAllOverlay() {
    requireReady();
    const tx = db.transaction(STORE_NAME, "readonly");
    return requestResult(tx.objectStore(STORE_NAME).getAll());
}

function baseNode(path) {
    let node = baseFilesystem["/"];
    if (path === "/") return { type: "directory", content: null };
    for (const part of path.slice(1).split("/")) {
        if (node === null || typeof node !== "object" || !Object.prototype.hasOwnProperty.call(node, part)) return null;
        node = node[part];
    }
    return node !== null && typeof node === "object"
        ? { type: "directory", content: null }
        : { type: "file", content: typeof node === "string" ? node : "" };
}

function hiddenByTombstone(path, entries) {
    let current = path;
    while (current !== "/") {
        if (entries.has(current) && entries.get(current).type === "tombstone") return true;
        const slash = current.lastIndexOf("/");
        current = slash <= 0 ? "/" : current.slice(0, slash);
    }
    return false;
}

function resolveNode(path, entries) {
    if (hiddenByTombstone(path, entries)) return null;
    const overlay = entries.get(path);
    if (overlay) return overlay.type === "tombstone" ? null : overlay;
    return baseNode(path);
}

function entryMap(rows) { return new Map(rows.map(row => [row.filePath, row])); }

async function nodeAt(path) {
    const rows = await readAllOverlay();
    return resolveNode(path, entryMap(rows));
}

function requireParent(path, entries) {
    const parent = path === "/" ? null : path.slice(0, path.lastIndexOf("/")) || "/";
    const node = resolveNode(parent, entries);
    if (!node) throw fsError("ENOENT", `parent directory does not exist: ${parent}`);
    if (node.type !== "directory") throw fsError("ENOTDIR", `parent is not a directory: ${parent}`);
}

function mutate(mutator) {
    requireReady();
    return new Promise((resolve, reject) => {
        let tx;
        try {
            tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                try { mutator(entryMap(request.result), store); }
                catch (error) {
                    try { tx.abort(); } catch (_) { /* transaction may already be inactive */ }
                    reject(error);
                }
            };
            request.onerror = () => reject(request.error || fsError("EIO", "could not read overlay"));
        } catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || fsError("EIO", "IndexedDB transaction failed"));
        tx.onabort = () => reject(tx.error || fsError("EIO", "IndexedDB transaction aborted"));
    });
}

function requireWritableTarget(path, entries) {
    if (path === "/") throw fsError("EISDIR", "cannot write the root directory");
    requireParent(path, entries);
    const current = resolveNode(path, entries);
    if (current?.type === "directory") throw fsError("EISDIR", `is a directory: ${path}`);
}

async function readFile(path) {
    path = normalizePath(path);
    const node = await nodeAt(path);
    if (!node) throw fsError("ENOENT", `no such file: ${path}`);
    if (node.type === "directory") throw fsError("EISDIR", `is a directory: ${path}`);
    return node.content;
}

async function writeFile(path, data) {
    path = normalizePath(path);
    await mutate((entries, store) => {
        requireWritableTarget(path, entries);
        store.put({ filePath: path, type: "file", content: data });
    });
}

async function mkdir(path) {
    path = normalizePath(path);
    if (path === "/") throw fsError("EEXIST", "root already exists");
    await mutate((entries, store) => {
        requireParent(path, entries);
        if (resolveNode(path, entries)) throw fsError("EEXIST", `already exists: ${path}`);
        store.put({ filePath: path, type: "directory", content: null });
    });
}

async function readdir(path) {
    path = normalizePath(path);
    const rows = await readAllOverlay();
    const entries = entryMap(rows);
    const directory = resolveNode(path, entries);
    if (!directory) throw fsError("ENOENT", `no such directory: ${path}`);
    if (directory.type !== "directory") throw fsError("ENOTDIR", `not a directory: ${path}`);
    const names = new Set();
    let base = baseFilesystem["/"];
    if (path !== "/") {
        for (const part of path.slice(1).split("/")) base = base && typeof base === "object" ? base[part] : null;
    }
    if (base && typeof base === "object") for (const name of Object.keys(base)) names.add(name);
    const prefix = path === "/" ? "/" : `${path}/`;
    for (const row of rows) {
        if (!row.filePath.startsWith(prefix)) continue;
        const remainder = row.filePath.slice(prefix.length);
        if (remainder && !remainder.includes("/")) names.add(remainder);
    }
    return [...names].filter(name => resolveNode(path === "/" ? `/${name}` : `${path}/${name}`, entries)).sort();
}

async function exists(path) { return !!(await nodeAt(normalizePath(path))); }

async function stat(path) {
    path = normalizePath(path);
    const node = await nodeAt(path);
    if (!node) throw fsError("ENOENT", `no such path: ${path}`);
    return { path, type: node.type, isFile: node.type === "file", isDirectory: node.type === "directory" };
}

async function deleteFile(path) {
    path = normalizePath(path);
    if (path === "/") throw fsError("EPERM", "cannot delete root");
    await mutate((entries, store) => {
        const node = resolveNode(path, entries);
        if (!node) throw fsError("ENOENT", `no such file: ${path}`);
        if (node.type !== "file") throw fsError("EISDIR", `is a directory: ${path}`);
        store.put({ filePath: path, type: "tombstone" });
    });
}

async function rmdir(path) {
    path = normalizePath(path);
    if (path === "/") throw fsError("EPERM", "cannot remove root");
    await mutate((entries, store) => {
        const node = resolveNode(path, entries);
        if (!node) throw fsError("ENOENT", `no such directory: ${path}`);
        if (node.type !== "directory") throw fsError("ENOTDIR", `not a directory: ${path}`);
        const prefix = `${path}/`;
        const names = new Set();
        let base = baseFilesystem["/"];
        for (const part of path.slice(1).split("/")) base = base && typeof base === "object" ? base[part] : null;
        if (base && typeof base === "object") Object.keys(base).forEach(name => names.add(name));
        for (const entry of entries.values()) {
            if (!entry.filePath.startsWith(prefix)) continue;
            const rest = entry.filePath.slice(prefix.length);
            if (rest && !rest.includes("/")) names.add(rest);
        }
        for (const name of names) {
            if (resolveNode(`${path}/${name}`, entries)) throw fsError("ENOTEMPTY", `directory is not empty: ${path}`);
        }
        if (base && typeof base === "object") store.put({ filePath: path, type: "tombstone" });
        else store.delete(path);
    });
}

async function copyFile(source, destination) {
    source = normalizePath(source);
    destination = normalizePath(destination);
    await mutate((entries, store) => {
        const node = resolveNode(source, entries);
        if (!node) throw fsError("ENOENT", `no such file: ${source}`);
        if (node.type !== "file") throw fsError("EISDIR", `is a directory: ${source}`);
        requireWritableTarget(destination, entries);
        store.put({ filePath: destination, type: "file", content: node.content });
    });
}

/** Moves files atomically. Directory moves are intentionally unsupported. */
async function rename(oldPath, newPath) {
    oldPath = normalizePath(oldPath);
    newPath = normalizePath(newPath);
    if (oldPath === "/" || newPath === "/") throw fsError("EPERM", "cannot rename root");
    await mutate((entries, store) => {
        const node = resolveNode(oldPath, entries);
        if (!node) throw fsError("ENOENT", `no such path: ${oldPath}`);
        if (node.type !== "file") throw fsError("EPERM", "directory rename is not supported");
        requireWritableTarget(newPath, entries);
        if (resolveNode(newPath, entries)) throw fsError("EEXIST", `already exists: ${newPath}`);
        store.put({ filePath: newPath, type: "file", content: node.content });
        store.put({ filePath: oldPath, type: "tombstone" });
    });
}


// ===== draw.js =====
const canvas = document.getElementById('display');
const ctx = canvas.getContext('2d');

function renderScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function clearScreen() {
    renderScreen();
    lines = 10;
    cursorX = column;
    resetInputHistory();
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    renderScreen();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Shapes

function drawSquare(x, y, width, height, hex) {
    ctx.fillStyle = hex;
    ctx.fillRect(x, y, width, height);
}

function drawLine(startx, starty, endx, endy, width, hex) {
    ctx.beginPath();
    ctx.moveTo(startx, starty);
    ctx.lineTo(endx, endy);
    ctx.strokeStyle = hex;
    ctx.lineWidth = width;
    ctx.stroke();
}

function drawCircle(x, y, radius, hex, startAngle = 0, endAngle = Math.PI * 2) {
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.fillStyle = hex;
    ctx.fill();
}

let column = 10;     // Margine sinistro
let lines = 10;      // Riga Y corrente
let cursorX = 10;    // Posizione X corrente del cursore
const inputHistory = [];

function drawInputCharacter(char, size = 16, font = "monospace", color = "#ffffff") {
    ctx.font = `${size}px ${font}`;
    ctx.textBaseline = "top";
    const lineHeight = size + 6;
    const width = ctx.measureText(char).width;
    const before = { x: cursorX, y: lines };

    if (cursorX + width > canvas.width - column && cursorX > column) {
        cursorX = column;
        lines += lineHeight;
    }

    lines = ensureVisible(lines, lineHeight, (scrollAmount) => {
        before.y -= scrollAmount;
    });

    const position = { x: cursorX, y: lines, width, height: lineHeight, before };
    ctx.fillStyle = color;
    ctx.fillText(char, cursorX, lines);
    cursorX += width;
    inputHistory.push(position);
}

function eraseInputCharacter() {
    const previous = inputHistory.pop();
    if (!previous) return false;
    ctx.clearRect(previous.x - 1, previous.y - 1, previous.width + 2, previous.height + 2);
    cursorX = previous.before.x;
    lines = previous.before.y;
    return true;
}

function resetInputHistory() {
    inputHistory.length = 0;
}

function scrollScreen(lineHeight) {
    const shift = Math.min(lineHeight, canvas.height);
    if (shift <= 0) return;
    const remainingHeight = canvas.height - shift;
    if (remainingHeight > 0) {
        const image = ctx.getImageData(0, shift, canvas.width, remainingHeight);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.putImageData(image, 0, 0);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    lines = Math.max(0, lines - shift);
    for (const entry of inputHistory) {
        entry.y -= shift;
        entry.before.y -= shift;
    }
}

function ensureVisible(y, lineHeight, onScroll) {
    while (y + lineHeight > canvas.height && canvas.height > 0) {
        scrollScreen(lineHeight);
        y = Math.max(0, y - lineHeight);
        onScroll?.(lineHeight);
        if (canvas.height <= lineHeight) break;
    }
    return y;
}

function drawText(text, newLine = true, defaultHex = "#ffffff", size = 16, font = "monospace", x = -1, y = -1) {
    ctx.font = `${size}px ${font}`;
    ctx.textBaseline = "top";

    const margin = (x === -1) ? column : x;
    const maxWidth = ctx.canvas.width - margin;
    const lineHeight = size + 6;

    // Se x è -1 usa la posizione attuale del cursore (cursorX) invece di ripartire sempre dal margine
    let currentX = (x === -1) ? cursorX : x;
    let currentY = (y === -1) ? lines : y;

    const parts = text.split(/(\$#[0-9a-fA-F]{6}|\$#)/g);
    ctx.fillStyle = defaultHex;

    for (const part of parts) {
        if (!part) continue;

        if (part === "$#") {
            ctx.fillStyle = defaultHex;
            continue;
        } else if (part.startsWith("$#")) {
            ctx.fillStyle = "#" + part.slice(2);
            continue;
        }

        const textLines = part.split("\n");

        for (let i = 0; i < textLines.length; i++) {
            if (i > 0) {
                currentX = margin;
                currentY += lineHeight;
                currentY = ensureVisible(currentY, lineHeight);
            }

            const tokens = textLines[i].split(/(\s+)/);

            for (const token of tokens) {
                if (!token) continue;
                const tokenWidth = ctx.measureText(token).width;

                if (currentX + tokenWidth > maxWidth && currentX > margin) {
                    currentX = margin;
                    currentY += lineHeight;
                    currentY = ensureVisible(currentY, lineHeight);
                    if (token.trim() === "") continue;
                }

                if (tokenWidth > maxWidth) {
                    for (const char of token) {
                        const charWidth = ctx.measureText(char).width;
                        if (currentX + charWidth > maxWidth && currentX > margin) {
                            currentX = margin;
                            currentY += lineHeight;
                            currentY = ensureVisible(currentY, lineHeight);
                        }
                        ctx.fillText(char, currentX, currentY);
                        currentX += charWidth;
                    }
                } else {
                    ctx.fillText(token, currentX, currentY);
                    currentX += tokenWidth;
                }
            }
        }
    }

    currentY = ensureVisible(currentY, lineHeight);

    // Aggiorna la posizione per la chiamata successiva
    if (y === -1) {
        if (newLine) {
            lines = currentY + lineHeight;
            cursorX = margin; // Torna a capo a sinistra
        } else {
            lines = currentY;
            cursorX = currentX; // Resta sulla stessa riga per il prossimo carattere
        }
    }
}


// ===== boot.js =====
window.Environment = Object.assign(Object.create(null), {});

function isWasmSupported() {
    try {
        if (typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function") {
            const wasmHeader = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
            const module = new WebAssembly.Module(wasmHeader);

            if (module instanceof WebAssembly.Module) {
                return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
            }
        }
    } catch (e) {
        return false;
    }
    return false;
}

async function boot() {
    try {
        await initFilesystem();
        drawText("[ $#37eb34OK$# ]: Inizialising filesystem");
        drawText("[ $#37eb34OK$# ]: Loading package and repositories manager");
        drawText("[ $#37eb34OK$# ]: Loading terminal");

        window.Environment.USERNAME = await readFile("/etc/passwd");
        window.Environment.HOSTNAME = await readFile("/etc/hostname");
        window.Environment.HOME = "/root"

        if (isWasmSupported) {
            window.Environment.supportedArch = "wasm";
        } else {
            window.Environment.supportedArch = "";
        }

        if (window.location.pathname.split('/').pop() === "index.html") {
            window.Environment.arch = "native";
            window.Environment.supportedArch += ",native,es5";
        } else if (window.location.pathname.split('/').pop() === "legacy.html") {
            window.Environment.arch = "es5";
            window.Environment.supportedArch += ",es5";
        } else {
            throw new Error("Cannot state arch (JavaScript version)");
        }

        drawText("Boot Complete!");
        drawText(`${window.Environment.USERNAME}@${window.Environment.HOSTNAME}:~$ `, false);
        
        return true;
    } catch (error) {
	    drawText(`[ $#ff0000ERROR$# ] ${error.message || error}`, false);
        return error;
    }
}

function poweroff() {
    try {
        drawText("[ $#37eb34OK$# ]: Unmounting filesystem");
        drawText("Power off completed. It is now safe to unplug the pc");
        return { halt: true };
    } catch (error) {
	    drawText(`[ $#ff0000ERROR$# ] ${error.message || error}`, false);
        return error;
    }
}

function reboot() {
    poweroff();
    drawText("System will now reboot!");
    window.location.reload();
}


// ===== commands.js =====
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
    const bashHistory = resolvePath("~/.bash_history");
    let history = "";
    try {
        history = await readFile(bashHistory);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    await writeFile(bashHistory, `${history}${commandLine}\n`);

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

    // Command files name trusted command handlers bundled in this classic script.
    if (typeof scriptPath !== "string" || !/^\.\/(bin|sbin|etc)\/[\w-]+(\.js)?$/.test(scriptPath)) {
        throw new Error(`${command}: invalid command script`);
    }
    const commandRunners = {
        "./bin/apt.js": apt,
        "./bin/cat.js": cat,
        "./bin/cd.js": changeDirectory,
        "./bin/clear.js": clear,
        "./bin/echo.js": echo,
        "./bin/export.js": exportVariables,
        "./bin/help.js": help,
        "./bin/ls.js": ls,
        "./bin/mkdir.js": makeDirectory,
        "./bin/pwd.js": printWorkingDirectory,
        "./bin/uname.js": uname,
        "./bin/webfetch.js": webfetch,
        "./sbin/poweroff.js": runPoweroff,
        "./sbin/reboot.js": runReboot
    };
    const run = commandRunners[scriptPath];
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


// ===== TTY.js =====
const bootReady = boot();

const terminalCanvas = document.getElementById("display");
const hiddenInput = document.getElementById("mobile-keyboard");
let commandBuffer = "";
let terminalHalted = false;
const homeDirectory = window.Environment.HOME || "/root";
let currentDirectory = homeDirectory;

function drawPrompt() {
    const homeRelativePath = currentDirectory === homeDirectory
        ? "~"
        : currentDirectory.startsWith(`${homeDirectory}/`)
            ? `~${currentDirectory.slice(homeDirectory.length)}`
            : currentDirectory;
    const username = window.Environment.USERNAME || "root";
    const hostname = window.Environment.HOSTNAME || "localhost";
    drawText(`${username}@${hostname}:${homeRelativePath}$ `, false, "#ffffff", 16, "monospace");
}

function stdout(message) {
    drawText(String(message), true, "#FFFFFF", 16, "monospace");
}

function stderr(code, message) {
    drawText(String(message), true, "#FF0000", 16, "monospace");
}

terminalCanvas.addEventListener("pointerdown", (e) => {
    e.preventDefault(); 
    hiddenInput.focus();
});

hiddenInput.addEventListener("input", (e) => {
    const insertedText = hiddenInput.value;
    if (insertedText.length > 0) {
        for (const char of insertedText) {
            if (char === "\n" || char === "\r") continue;
            commandBuffer += char;
            drawInputCharacter(char);
        }
        hiddenInput.value = "";
    }
});

function resolvePath(path, cwd) {
    if (path === "~") return normalizePath(window.Environment.HOME || "/root");
    if (path.startsWith("~/")) return normalizePath(`${window.Environment.HOME || "/root"}/${path.slice(2)}`);
    return normalizePath(path.startsWith("/") ? path : `${cwd}/${path}`);
}

let history = [];
let historyIndex = -1;
let historyReady = bootReady
    .then(() => readFile(resolvePath("~/.bash_history")))
    .then((result) => {
        history = result.split(/\r?\n/).filter(Boolean);
    })
    .catch((error) => {
        if (error.code !== "ENOENT") drawText(error.message, true, "#ff5555", 16, "monospace");
    });

function showInput(value) {
    while (eraseInputCharacter()) { /* Clear the currently displayed command. */ }
    commandBuffer = value;
    for (const char of commandBuffer) drawInputCharacter(char);
    hiddenInput.value = "";
}

function recallHistory(index) {
    if (index < 0 || index >= history.length) return;
    historyIndex = index;
    showInput(history[history.length - 1 - historyIndex]);
}

hiddenInput.addEventListener("keydown", (e) => {
    if (terminalHalted) {
        e.preventDefault();
        return;
    }
    if (e.key === "Enter") {
        e.preventDefault();
        const line = commandBuffer;
        commandBuffer = "";
        historyIndex = -1;
        resetInputHistory();
        hiddenInput.value = "";
        drawText("\n", true, "#ffffff", 16, "monospace");
        historyReady.then(() => {
            history.push(line);
            historyIndex = -1;
            return exec(line, currentDirectory);
        })
            .then((result) => {
                currentDirectory = result.cwd;
                if (result.halt) {
                    terminalHalted = true;
                    hiddenInput.disabled = true;
                }
                if (result.output === "\u0000CLEAR") {
                    clearScreen();
                } else if (result.output) {
                    drawText(result.output);
                }
            })
            .catch((error) => drawText(error.message, true, "#ff5555", 16, "monospace"))
            .finally(() => {
                if (!terminalHalted) drawPrompt();
            });
    } else if (e.key === "Backspace" && commandBuffer.length > 0) {
        e.preventDefault();
        commandBuffer = commandBuffer.slice(0, -1);
        eraseInputCharacter();
        hiddenInput.value = "";
    } else if (e.key === "ArrowUp" && history.length > 0) {
        e.preventDefault();
        recallHistory(Math.min(historyIndex + 1, history.length - 1));
    } else if (e.key === "ArrowDown" && historyIndex > 0) {
        e.preventDefault();
        recallHistory(historyIndex - 1);
    } else if (e.key === "ArrowDown" && historyIndex === 0) {
        e.preventDefault();
        historyIndex = -1;
        showInput("");
    }
});


// ===== bin/apt.js =====
async function ensureDirectory(path) {
    if (await exists(path)) return;
    const parent = path.slice(0, path.lastIndexOf("/")) || "/";
    await ensureDirectory(parent);
    await mkdir(path);
}

function tarString(bytes, start, length) {
    const end = bytes.indexOf(0, start);
    return new TextDecoder().decode(bytes.subarray(start, Math.min(end < 0 ? start + length : end, start + length)));
}

function parseTar(bytes) {
    const files = new Map();
    for (let offset = 0; offset + 512 <= bytes.length;) {
        const header = bytes.subarray(offset, offset + 512);
        if (header.every(byte => byte === 0)) break;
        const name = tarString(header, 0, 100);
        const prefix = tarString(header, 345, 155);
        const path = prefix ? `${prefix}/${name}` : name;
        const sizeText = tarString(header, 124, 12).trim().replace(/\0.*$/, "");
        const size = Number.parseInt(sizeText || "0", 8);
        if (!Number.isSafeInteger(size) || size < 0) throw new Error("apt: package contains an invalid tar entry");
        const type = header[156];
        const dataStart = offset + 512;
        if (type === 0 || type === 48) files.set(path.replace(/\/$/, ""), bytes.slice(dataStart, dataStart + size));
        else if (type !== 53 && type !== 0 && type !== 48) throw new Error(`apt: unsupported tar entry type for '${path}'`);
        offset = dataStart + Math.ceil(size / 512) * 512;
    }
    return files;
}

async function unpackPackage(compressed, packageName) {
    if (typeof DecompressionStream !== "function") throw new Error("apt: this browser cannot unpack gzip packages");
    let tarBytes;
    try {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
        tarBytes = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
        throw new Error(`apt: '${packageName}' is not a valid gzip package`);
    }

    const entries = parseTar(tarBytes);
    let metadata;
    try {
        const metadataBytes = entries.get("metadata.json");
        if (!metadataBytes) throw new Error("metadata missing");
        metadata = JSON.parse(new TextDecoder().decode(metadataBytes));
    } catch {
        throw new Error(`apt: '${packageName}' has missing or invalid metadata.json`);
    }
    if (!metadata || typeof metadata.main !== "string") throw new Error(`apt: '${packageName}' metadata must define main`);

    const installEntries = [[metadata.main.replace(/^\//, ""), metadata.main]];
    if (metadata.other_dirs && typeof metadata.other_dirs === "object" && !Array.isArray(metadata.other_dirs)) {
        for (const [source, destination] of Object.entries(metadata.other_dirs)) installEntries.push([source, destination]);
    }

    for (const [source, destination] of installEntries) {
        if (typeof destination !== "string" || !source || source.startsWith("/") || normalizePath(`/${source}`) !== `/${source}`) {
            throw new Error(`apt: '${packageName}' metadata contains an invalid file path`);
        }
        let content = entries.get(source);
        if (content === undefined) throw new Error(`apt: '${packageName}' archive is missing '${source}'`);
        let target = destination;
        if (target === "~") target = window.Environment.HOME || "/root";
        else if (target.startsWith("~/")) target = `${window.Environment.HOME || "/root"}/${target.slice(2)}`;
        target = normalizePath(target.startsWith("/") ? target : `/${target}`);
        if (/\.(?:js|mjs|cjs|json|txt|html|css|xml|svg)$/i.test(target)) content = new TextDecoder().decode(content);
        await ensureDirectory(target.slice(0, target.lastIndexOf("/")) || "/");
        await writeFile(target, content);
    }
}

async function apt({ args, cwd, resolvePath }) {
    if (args.length === 0) throw new Error("apt: missing operand");
    if (!navigator.onLine) throw new Error("apt: could not connect to the internet");

    const listsPath = "/var/lib/apt/lists/webtty.binaries";

    switch (args[0]) {
        case "update": {
            const forceUpdate = args.includes("--force");
            
            let currentPkgs = null;
            try {
                const rawLocal = await readFile(resolvePath(listsPath));
                currentPkgs = JSON.parse(rawLocal);
            } catch {
                currentPkgs = null;
            }

            stdout("Testing")

            const response = await fetch("https://raw.githubusercontent.com/Lorzo0822/WebTTY/refs/heads/main/ppa/links.json");
            if (!response.ok) throw new Error(`apt: could not connect to server, status: ${response.status}`);

            const onlinePkgs = await response.json();

            if (!currentPkgs || typeof currentPkgs.ver !== "number" || onlinePkgs.ver < currentPkgs.ver) {
                if (!forceUpdate) {
                    return "apt: WARNING, local package list is corrupted or missing. Please run 'apt update --force'";
                }
                await writeFile(resolvePath(listsPath), JSON.stringify(onlinePkgs));
                return "apt: forced update completed. Please run 'apt update' to verify integrity";
            }
            if (onlinePkgs.ver === currentPkgs.ver) {
                return "apt: Already up to date";
            }
            if (onlinePkgs.ver > currentPkgs.ver) {
                await writeFile(resolvePath(listsPath), JSON.stringify(onlinePkgs));
                return "apt: update completed";
            }
            break;
        }

        case "install": {
            const rawArg = args[1];
            if (!rawArg) {
                throw new Error("apt: please specify a package to install");
            }

            const [targetPkg, requestedArch] = rawArg.split(":");

            if (!targetPkg) {
                throw new Error("apt: invalid package specification");
            }

            const supportedArch = (window.Environment.supportedArch || window.Environment.arch || "")
                .split(",")
                .map(item => item.trim())
                .filter(Boolean);

            if (requestedArch && !supportedArch.includes(requestedArch)) {
                throw new Error(`apt: architecture '${requestedArch}' is not supported on this system`);
            }

            let currentPkgs = null;
            try {
                const rawLocal = await readFile(resolvePath(listsPath));
                currentPkgs = JSON.parse(rawLocal);
            } catch {
                currentPkgs = null;
            }
            if (!currentPkgs) {
                throw new Error("apt: packages list doesn't exist! try running 'apt update --force'");
            }

            const allMatches = [];
            for (const [category, packages] of Object.entries(currentPkgs)) {
                if (typeof packages === "object" && packages !== null && packages[targetPkg]) {
                    allMatches.push({ category, ...packages[targetPkg] });
                }
            }

            if (allMatches.length === 0) {
                throw new Error(`apt: no package(s) named ${targetPkg} found`);
            }

            let selectedPkg;

            if (requestedArch) {
                selectedPkg = allMatches.find(pkg => pkg.category === requestedArch);
                if (!selectedPkg) {
                    throw new Error(`apt: package '${targetPkg}' has no '${requestedArch}' version`);
                }
            } else {
                const compatible = allMatches.filter(pkg => supportedArch.includes(pkg.category));
                if (compatible.length === 0) {
                    throw new Error(`apt: no package(s) named ${targetPkg} found for your architecture`);
                }

                compatible.sort((a, b) => supportedArch.indexOf(a.category) - supportedArch.indexOf(b.category));
                selectedPkg = compatible[0];
            }

            const pkgURL = `https://raw.githubusercontent.com/Lorzo0822/WebTTY/refs/heads/main/ppa/${encodeURIComponent(selectedPkg.category)}/${encodeURIComponent(selectedPkg.file)}`;
            const response = await fetch(pkgURL);
            if (!response.ok) throw new Error(`apt: could not download '${targetPkg}', status: ${response.status}`);
            const packageData = await response.arrayBuffer();
            await unpackPackage(packageData, targetPkg);
            return `apt: installed ${targetPkg}:${selectedPkg.category} (${selectedPkg.version || "unknown version"})`;
        }

        case "add-repo": {
            const linksPath = resolvePath("/var/lib/apt/lists/links");
            const links = args.slice(1).map(link => link.replace(/^"|"$/g, ""));

            if (links.length === 0) {
                throw new Error("apt: please specify a link to a repository");
            }

            let currentLinks = "";
            try {
                currentLinks = await readFile(linksPath);
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }

            const savedLinks = new Set(
                currentLinks.split("\n").map(link => link.trim()).filter(Boolean)
            );
            const addedLinks = [];

            for (let link of links) {
                try {
                    let response = null;

                    if (!link.endsWith("links.json")) {
                        response = await fetch(link+`/${encodeURIComponent("links.json")}`);
                    } else {
                        response = await fetch(link);
                    }

                    if (!response.ok) {
                        stderr(1, `apt: could not fetch given url: "${link}"`);
                        continue;
                    }

                    if (savedLinks.has(link)) {
                        stdout(`apt: link "${link}" already exists, skipping`);
                        continue;
                    }

                    savedLinks.add(link.endsWith("links.json") ? link.replace("/links.json", "") : link);
                    addedLinks.push(link.endsWith("links.json") ? link.replace("/links.json", "") : link);
                } catch {
                    stderr(1, `apt: could not fetch given url: "${link}"`);
                }
            }

            await writeFile(linksPath, [...savedLinks].join("\n"));
            return `apt: repos added: ${addedLinks.join(", ")}`;
        }

        default:
            throw new Error(`apt: invalid operation ${args[0]}`);
    }
}


// ===== bin/cat.js =====
async function cat({ args, cwd, resolvePath }) {
    if (args.length === 0) throw new Error("cat: missing operand");

    const contents = [];
    for (const path of args) {
        try {
            contents.push(await readFile(resolvePath(path, cwd)));
        } catch (error) {
            throw new Error(`cat: ${path}: ${error.message}`);
        }
    }
    return contents.join("");
}


// ===== bin/cd.js =====
async function changeDirectory({ args, cwd, resolvePath }) {
    if (args.length > 1) throw new Error("cd: too many arguments");
    const destination = resolvePath(args[0] || "~", cwd);
    const node = await stat(destination);
    if (!node.isDirectory) throw new Error(`cd: not a directory: ${args[0] || destination}`);
    return { cwd: destination };
}


// ===== bin/clear.js =====
function clear() {
    return "\u0000CLEAR";
}


// ===== bin/echo.js =====
const VARIABLE_PATTERN = /\$([A-Za-z_][A-Za-z0-9_]*)/g;

function echo({ args }) {
    return args.join(" ").replace(VARIABLE_PATTERN, (_, name) => window.Environment[name] ?? "");
}


// ===== bin/export.js =====
const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function exportVariables({ args }) {
    if (args.length === 0) {
        return Object.keys(window.Environment)
            .sort()
            .map((name) => `${name}=${window.Environment[name]}`)
            .join("\n");
    }

    for (const assignment of args) {
        const separator = assignment.indexOf("=");
        if (separator < 1) throw new Error(`export: expected NAME=value, got: ${assignment}`);

        const name = assignment.slice(0, separator);
        const value = assignment.slice(separator + 1);
        if (!VALID_NAME.test(name)) throw new Error(`export: invalid variable name: ${name}`);
        window.Environment[name] = value;
    }
    return "";
}


// ===== bin/help.js =====
function help() {
    return "Available commands: help, ls [path], mkdir <path>, cd [path], pwd, cat <file>, echo [text], export [NAME=value], clear";
}


// ===== bin/ls.js =====
async function ls({ args, cwd, resolvePath }) {
    if (args.length > 1) throw new Error("ls: too many arguments");
    const path = args[0] ? resolvePath(args[0], cwd) : cwd;
    return (await readdir(path)).join("  ");
}


// ===== bin/mkdir.js =====
async function makeDirectory({ args, cwd, resolvePath }) {
    if (args.length === 0) throw new Error("mkdir: missing operand");
    for (const path of args) await mkdir(resolvePath(path, cwd));
    return "";
}


// ===== bin/pwd.js =====
function printWorkingDirectory({ cwd }) {
    return cwd;
}


// ===== bin/uname.js =====
function uname({ args }) {
  const info = {
    s: "WebTTY",                                  // Kernel name (-s)
    n: window.Environment.HOSTNAME || "localhost",   // Network node hostname (-n)
    r: "1.0.0-web",                               // Kernel release (-r)
    v: `#1 SMP ${new Date().toDateString()}`,     // Kernel version (-v)
    m: window.Environment.arch,            // Machine hardware (-m)
    o: "Browser/JS"                               // Operating system (-o)
  };

  if (!args || args.length === 0) {
    return info.s;
  }
  if (args.includes("-a") || args.includes("--all")) {
    return `${info.s} ${info.n} ${info.r} ${info.v} ${info.m} ${info.o}`;
  }
  const output = [];

  for (const arg of args) {
    if (arg.startsWith("-") && !arg.startsWith("--")) {
      const flags = arg.slice(1).split("");
      for (const flag of flags) {
        if (info[flag]) {
          output.push(info[flag]);
        } else {
          return `uname: invalid option -- '${flag}'`;
        }
      }
    } else {
      return `uname: extra operand '${arg}'`;
    }
  }

  return output.join(" ");
}


// ===== bin/webfetch.js =====
async function webfetch({ args, cwd, resolvePath }) {
    const osRelease = await readFile(resolvePath("/etc/os-release"));
    
    const result = Object.fromEntries(
        osRelease
            .trim()
            .split('\n')
            .filter(line => line.includes('='))
            .map(line => {
            const index = line.indexOf('=');
            const key = line.slice(0, index).trim();
            let val = line.slice(index + 1).trim();

            val = val.replace(/^["']|["']$/g, '');

            return [key, val];
        })
    );

    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const gl1 = canvas.getContext("webgl");

    const gl = gl2 || gl1;
    const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");

    const webglRenderer = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl?.getParameter(gl.RENDERER) || "Unavailable";
        
    const webglVersion = gl ? gl.getParameter(gl.VERSION) : "Unavailable";
    
    const gpuVendor = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : gl?.getParameter(gl.VENDOR) || "Unavailable";

    const tux = `
        $#7F7F7F#####$#	       @${window.Environment.HOSTNAME}
       $#7F7F7F#######$#	       OS: ${result["PRETTY_NAME"]}
       $#7F7F7F##$#$#FFFFFFO$#$#7F7F7F#$#$#FFFFFFO$#$#7F7F7F##$#	       arch: ${window.Environment.arch}
       $#7F7F7F#$#$#FFFF00#####$#$#7F7F7F#$#
     $#7F7F7F##$#$#FFFFFF##$#$#FFFF00###$#$#FFFFFF##$#$#7F7F7F##$#       WebGL: ${webglRenderer}
    $#7F7F7F#$#$#FFFFFF##########$#$#7F7F7F##$#      WebGL version: ${webglVersion}
   $#7F7F7F#$#$#FFFFFF############$#$#7F7F7F##$#     GPU vendor: ${gpuVendor}
   $#7F7F7F#$#$#FFFFFF############$#$#7F7F7F###$#
  $#FFFF00##$#$#7F7F7F#$#$#FFFFFF############$#$#7F7F7F##$#$#FFFF00#$#    online: ${navigator.onLine}
$#FFFF00######$#$#7F7F7F#$#$#FFFFFF#######$#$#7F7F7F#$#$#FFFF00######$#
$#FFFF00#######$#$#7F7F7F#$#$#FFFFFF#####$#$#7F7F7F#$#$#FFFF00#######$#  home: ${window.Environment.HOME}
  $#FFFF00#####$#$#7F7F7F#######$#$#FFFF00#####$#
`;
    return tux;
}


// ===== bin/wscript.js =====



// ===== sbin/poweroff.js =====
function runPoweroff() {
    return poweroff();
}


// ===== sbin/reboot.js =====
function runReboot() {
    return reboot();
}
