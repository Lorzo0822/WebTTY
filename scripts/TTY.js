import { boot } from './boot.js';
import { drawText, clearScreen, drawInputCharacter, eraseInputCharacter, resetInputHistory } from './draw.js';
import { exec } from './commands.js';

const bootReady = boot();

const canvas = document.getElementById("display");
const hiddenInput = document.getElementById("mobile-keyboard");
let commandBuffer = "";
let terminalHalted = false;
const homeDirectory = window.Environment.HOME || "/root";
let currentDirectory = homeDirectory;

function drawPrompt() {
    const homeRelativePath = currentDirectory === homeDirectory
        ? "~"
        : currentDirectory.startsWith(`${homeDirectory}/`)
            ? `~${currentDirectory.slice(homeDirectory.length)}`
            : currentDirectory;
    const username = window.Environment.USERNAME || "root";
    const hostname = window.Environment.HOSTNAME || "localhost";
    drawText(`${username}@${hostname}:${homeRelativePath}$ `, false, "#ffffff", 16, "monospace");
}

canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault(); 
    hiddenInput.focus();
});

hiddenInput.addEventListener("input", (e) => {
    const insertedText = hiddenInput.value;
    if (insertedText.length > 0) {
        for (const char of insertedText) {
            if (char === "\n" || char === "\r") continue;
            commandBuffer += char;
            drawInputCharacter(char);
        }
        hiddenInput.value = "";
    }
});

hiddenInput.addEventListener("keydown", (e) => {
    if (terminalHalted) {
        e.preventDefault();
        return;
    }
    if (e.key === "Enter") {
        e.preventDefault();
        const line = commandBuffer;
        commandBuffer = "";
        resetInputHistory();
        hiddenInput.value = "";
        drawText("\n", true, "#ffffff", 16, "monospace");
        bootReady.then(() => exec(line, currentDirectory))
            .then((result) => {
                currentDirectory = result.cwd;
                if (result.halt) {
                    terminalHalted = true;
                    hiddenInput.disabled = true;
                }
                if (result.output === "\u0000CLEAR") {
                    clearScreen();
                } else if (result.output) {
                    drawText(result.output);
                }
            })
            .catch((error) => drawText(error.message, true, "#ff5555", 16, "monospace"))
            .finally(() => {
                if (!terminalHalted) drawPrompt();
            });
    } else if (e.key === "Backspace" && commandBuffer.length > 0) {
        e.preventDefault();
        commandBuffer = commandBuffer.slice(0, -1);
        eraseInputCharacter();
        hiddenInput.value = "";
    }
});

