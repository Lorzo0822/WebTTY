import { readFile, writeFile } from "../filesystem.js";

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

        default:
            throw new Error(`apt: invalid operation ${args[0]}`);
    }
}
