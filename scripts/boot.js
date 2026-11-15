import { initFilesystem, readFile } from "./filesystem.js";
import { drawText } from "./draw.js";

async function boot() {
    try {
        await initFilesystem();
        drawText("[ $#37eb34OK$# ]: Inizialising filesystem");
        localStorage.setItem("USERNAME", await readFile("/etc/passwd"));
        localStorage.setItem("HOSTNAME", await readFile("/etc/hostname"));
        drawText("Boot Complete!");
        drawText(`${localStorage.getItem("USERNAME")}@${localStorage.getItem("HOSTNAME")}:~$ `, false);
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
