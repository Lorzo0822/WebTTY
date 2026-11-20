import { initFilesystem, readFile, normalizePath } from "./filesystem.js";
import { drawText } from "./draw.js";

window.Environment = Object.assign(Object.create(null), {});

function isWasmSupported() {
    try {
        if (typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function") {
            const wasmHeader = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
            const module = new WebAssembly.Module(wasmHeader);

            if (module instanceof WebAssembly.Module) {
                return new WebAssembly.Instance(module) instanceof WebAssembly.Instance;
            }
        }
    } catch (e) {
        return false;
    }
    return false;
}

async function boot() {
    try {
        await initFilesystem();
        drawText("[ $#37eb34OK$# ]: Inizialising filesystem");
        drawText("[ $#37eb34OK$# ]: Loading package and repositories manager");
        drawText("[ $#37eb34OK$# ]: Loading terminal");

        window.Environment.USERNAME = await readFile("/etc/passwd");
        window.Environment.HOSTNAME = await readFile("/etc/hostname");
        window.Environment.HOME = "/root"

        if (isWasmSupported) {
            window.Environment.supportedArch = "wasm";
        } else {
            window.Environment.supportedArch = "";
        }

        if (window.location.pathname.split('/').pop() === "index.html") {
            window.Environment.arch = "native";
            window.Environment.supportedArch += ",native,es5";
        } else if (window.location.pathname.split('/').pop() === "legacy.html") {
            window.Environment.arch = "es5";
            window.Environment.supportedArch += ",es5";
        } else {
            throw new Error("Cannot state arch (JavaScript version)");
        }

        drawText("Boot Complete!");
        drawText(`${window.Environment.USERNAME}@${window.Environment.HOSTNAME}:~$ `, false);
        
        return true;
    } catch (error) {
	    drawText(`[ $#ff0000ERROR$# ] ${error.message || error}`, false);
        return error;
    }
}

function poweroff() {
    try {
        drawText("[ $#37eb34OK$# ]: Unmounting filesystem");
        drawText("Power off completed. It is now safe to unplug the pc");
        return { halt: true };
    } catch (error) {
	    drawText(`[ $#ff0000ERROR$# ] ${error.message || error}`, false);
        return error;
    }
}

function reboot() {
    poweroff();
    drawText("System will now reboot!");
    window.location.reload();
}

export { boot, poweroff, reboot };
