import { stat } from "../filesystem.js";

export default async function changeDirectory({ args, cwd, resolvePath }) {
    if (args.length > 1) throw new Error("cd: too many arguments");
    const destination = resolvePath(args[0] || "~", cwd);
    const node = await stat(destination);
    if (!node.isDirectory) throw new Error(`cd: not a directory: ${args[0] || destination}`);
    return { cwd: destination };
}
