import assert from "node:assert/strict";
import { normalizePath } from "../scripts/filesystem.js";

assert.throws(() => normalizePath("home/user"), error => error.code === "EINVAL");
console.log("PASS normalizePath requires absolute paths");

assert.equal(normalizePath("/home/user/./docs/../file"), "/home/user/file");
assert.equal(normalizePath("/../../etc/passwd"), "/etc/passwd");
assert.equal(normalizePath("/"), "/");
console.log("PASS normalizePath resolves dot segments and clamps traversal at root");

assert.notEqual(normalizePath("/home/user"), normalizePath("/home/username"));
console.log("PASS normalizePath preserves path component boundaries");
