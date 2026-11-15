import { readdir } from "../filesystem.js";

export default async function ls({ args, cwd, resolvePath }) {
    if (args.length > 1) throw new Error("ls: too many arguments");
    const path = args[0] ? resolvePath(args[0], cwd) : cwd;
    return (await readdir(path)).join("  ");
}
