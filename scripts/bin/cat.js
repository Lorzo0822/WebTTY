import { readFile } from "../filesystem.js";

export default async function cat({ args, cwd, resolvePath }) {
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
