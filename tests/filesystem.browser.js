import * as fs from "../scripts/filesystem.js";

const result = document.querySelector("#result");
const phaseKey = "webtty-fs-test-phase";
const checks = [];
let stage = "starting";
setTimeout(() => { if (result.textContent === "Running…") result.textContent = `TIMEOUT at ${stage}`; }, 4000);

function assert(condition, message) {
    if (!condition) throw new Error(message);
    checks.push(message);
}

async function rejectsCode(operation, code) {
    try { await operation(); }
    catch (error) {
        assert(error.code === code, `expected ${code}, received ${error.code || error.message}`);
        return;
    }
    throw new Error(`expected ${code}, operation succeeded`);
}

try {
    if (!localStorage.getItem(phaseKey)) {
        stage = "fetch base JSON";
        const original = await (await fetch("../assets/base_filesystem.json")).text();
        stage = "initialize filesystem";
        await fs.initFilesystem();
        stage = "read base file";
        assert(await fs.readFile("/etc/passwd") === "", "read original file");
        await fs.writeFile("/etc/passwd", "changed");
        assert(await fs.readFile("/etc/passwd") === "changed", "modify original file");
        await fs.mkdir("/home/user/test");
        await fs.mkdir("/home/user/test/nested");
        await fs.writeFile("/home/user/test/nested/file.txt", "persistent");
        assert(await fs.readFile("/home/user/test/nested/file.txt") === "persistent", "create and read nested file");
        assert((await fs.readdir("/home/user/test/nested")).join() === "file.txt", "list only direct children");
        await rejectsCode(() => fs.mkdir("/home/username"), "EEXIST");
        await fs.mkdir("/tmp/recreated");
        await fs.rmdir("/tmp/recreated");
        await fs.mkdir("/tmp/recreated");
        await fs.writeFile("/tmp/recreated/new.txt", "new");
        assert((await fs.readdir("/tmp/recreated")).join() === "new.txt", "recreate directory and add child");
        await rejectsCode(() => fs.rmdir("/home/user/test"), "ENOTEMPTY");
        await fs.deleteFile("/etc/fstab");
        assert(!(await fs.exists("/etc/fstab")), "hide original file with tombstone");
        await fs.rmdir("/usr/bin");
        assert(!(await fs.exists("/usr/bin")), "delete original empty directory");
        await fs.mkdir("/usr/bin");
        assert(await fs.exists("/usr/bin"), "recreate original directory");
        await fs.writeFile("/usr/bin/hidden", "temporary");
        await fs.deleteFile("/usr/bin/hidden");
        await fs.rmdir("/usr/bin");
        assert(!(await fs.exists("/usr/bin")), "rmdir ignores a child hidden by tombstone");
        await fs.mkdir("/usr/bin");
        await fs.copyFile("/etc/passwd", "/tmp/copied-passwd");
        assert(await fs.readFile("/tmp/copied-passwd") === "changed", "copy file content");
        await rejectsCode(() => fs.copyFile("/etc/passwd", "/usr"), "EISDIR");
        await fs.rename("/tmp/copied-passwd", "/tmp/renamed-passwd");
        assert(await fs.readFile("/tmp/renamed-passwd") === "changed" && !(await fs.exists("/tmp/copied-passwd")), "rename file atomically");
        await rejectsCode(() => fs.rename("/tmp/renamed-passwd", "/etc/passwd"), "EEXIST");
        assert(await fs.readFile("/tmp/renamed-passwd") === "changed", "failed rename preserves source data");
        await fs.mkdir("/tmp/concurrent").then(() => true, () => false);
        const competing = await Promise.allSettled([fs.mkdir("/tmp/race"), fs.mkdir("/tmp/race")]);
        assert(competing.filter(item => item.status === "fulfilled").length === 1, "serialize concurrent mkdir on same path");
        await rejectsCode(() => fs.writeFile("/missing/file", "x"), "ENOENT");
        await rejectsCode(() => fs.writeFile("/etc", "x"), "EISDIR");
        await rejectsCode(() => fs.readdir("/etc/passwd"), "ENOTDIR");
        await rejectsCode(() => fs.readFile("/does-not-exist"), "ENOENT");
        assert(fs.normalizePath("/home/user/../user/./x") === "/home/user/x", "normalize dot segments");
        assert(fs.normalizePath("/../../etc") === "/etc", "prevent traversal above root");
        assert(await fs.exists("/home/user") && !(await fs.exists("/home/username")), "distinguish user and username paths");
        const after = await (await fetch("../assets/base_filesystem.json")).text();
        assert(after === original, "base JSON remains unchanged");
        localStorage.setItem(phaseKey, "written");
        result.textContent = `PHASE 1 PASS (${checks.length} checks)\n${checks.join("\n")}`;
    } else {
        await fs.initFilesystem();
        assert(await fs.readFile("/etc/passwd") === "changed", "persist modified file after page reload");
        assert(await fs.readFile("/home/user/test/nested/file.txt") === "persistent", "persist nested file after page reload");
        assert(!(await fs.exists("/etc/fstab")), "persist original file deletion after page reload");
        assert(!(await fs.exists("/usr/bin")), "persist original directory deletion after page reload");
        localStorage.removeItem(phaseKey);
        result.textContent = `PASS (${checks.length} checks)\n${checks.join("\n")}`;
    }
} catch (error) {
    localStorage.removeItem(phaseKey);
    result.textContent = `FAIL\n${error.stack || error}`;
    console.error(error);
}
