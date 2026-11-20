import { readFile, writeFile, mkdir, exists, normalizePath } from "../filesystem.js";

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

export default async function apt({ args, cwd, resolvePath }) {
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


        default:
            throw new Error(`apt: invalid operation ${args[0]}`);
    }
}
