import { mkdir } from "../filesystem.js";

export default async function makeDirectory({ args, cwd, resolvePath }) {
    if (args.length === 0) throw new Error("mkdir: missing operand");
    for (const path of args) await mkdir(resolvePath(path, cwd));
    return "";
}
