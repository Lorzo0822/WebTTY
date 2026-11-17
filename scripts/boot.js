import { initFilesystem, readFile, normalizePath } from "./filesystem.js";
import { drawText } from "./draw.js";

window.Environment = Object.assign(Object.create(null), {});

async function boot() {
    try {
        await initFilesystem();
        drawText("[ $#37eb34OK$# ]: Inizialising filesystem");
        drawText("[ $#37eb34OK$# ]: Loading terminal");
        window.Environment.USERNAME = await readFile("/etc/passwd");
        window.Environment.HOSTNAME = await readFile("/etc/hostname");
        window.Environment.HOME = "/root"
        if (window.location.pathname.split('/').pop() === "index.html") {
            window.Environment.arch = "native";
        } else if (window.location.pathname.split('/').pop() === "legacy.html") {
            window.Environment.arch = "es5";
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
