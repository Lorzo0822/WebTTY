import { readFile, writeFile } from "../filesystem.js";

export default async function apt({ args, cwd,resolvePath }) {
    if (args.length === 0) throw new Error("apt: missing operand");
    if (!navigator.onLine) throw new Error("apt: could not connect to the internet");

    switch (args[0]) {
        case "update":
            const currentPkgs = await readFile(resolvePath(`/var/lib/apt/lists/webtty.binaries`));
            const response = await fetch("https://raw.githubusercontent.com/Lorzo0822/WebTTY/refs/heads/main/ppa/links.json");
            if (!response.ok) throw new Error(`apt: could not connect to server, status: ${response.status}`);

            const onlinePkgs = await response.json();
            return JSON.stringify(onlinePkgs);
    }
}