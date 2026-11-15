const DB_NAME = "WebTTY";
const DB_VERSION = 2;
const STORE_NAME = "files";
const BASE_URL = new URL("../assets/base_filesystem.json", import.meta.url);

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

export { initFilesystem, readFile, writeFile, mkdir, readdir, exists, deleteFile, rmdir, normalizePath, stat, rename, copyFile };
