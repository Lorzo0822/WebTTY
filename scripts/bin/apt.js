import { readFile, writeFile } from "../filesystem.js";

export default async function apt({ args, cwd,resolvePath }) {
    if (args.length === 0) throw new Error("apt: missing operand");

    switch (args[0]) {
        case "update":
            await readFile(resolvePath(`/var/lib/apt/lists/webtty.binaries.${window.Environment.arch}`));
    }
}