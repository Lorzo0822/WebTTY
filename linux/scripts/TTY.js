import { boot } from './boot.js';
import { drawText, clearScreen, drawInputCharacter, eraseInputCharacter, resetInputHistory } from './draw.js';
import { exec } from './commands.js';
import { normalizePath, readFile } from './filesystem.js';

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

export function stdout(message) {
    drawText(String(message), true, "#FFFFFF", 16, "monospace");
}

export function stderr(code, message) {
    drawText(String(message), true, "#FF0000", 16, "monospace");
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

function resolvePath(path, cwd) {
    if (path === "~") return normalizePath(window.Environment.HOME || "/root");
    if (path.startsWith("~/")) return normalizePath(`${window.Environment.HOME || "/root"}/${path.slice(2)}`);
    return normalizePath(path.startsWith("/") ? path : `${cwd}/${path}`);
}

let history = [];
let historyIndex = -1;
let historyReady = bootReady
    .then(() => readFile(resolvePath("~/.bash_history")))
    .then((result) => {
        history = result.split(/\r?\n/).filter(Boolean);
    })
    .catch((error) => {
        if (error.code !== "ENOENT") drawText(error.message, true, "#ff5555", 16, "monospace");
    });

function showInput(value) {
    while (eraseInputCharacter()) { /* Clear the currently displayed command. */ }
    commandBuffer = value;
    for (const char of commandBuffer) drawInputCharacter(char);
    hiddenInput.value = "";
}

function recallHistory(index) {
    if (index < 0 || index >= history.length) return;
    historyIndex = index;
    showInput(history[history.length - 1 - historyIndex]);
}

hiddenInput.addEventListener("keydown", (e) => {
    if (terminalHalted) {
        e.preventDefault();
        return;
    }
    if (e.key === "Enter") {
        e.preventDefault();
        const line = commandBuffer;
        commandBuffer = "";
        historyIndex = -1;
        resetInputHistory();
        hiddenInput.value = "";
        drawText("\n", true, "#ffffff", 16, "monospace");
        historyReady.then(() => {
            history.push(line);
            historyIndex = -1;
            return exec(line, currentDirectory);
        })
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
    } else if (e.key === "ArrowUp" && history.length > 0) {
        e.preventDefault();
        recallHistory(Math.min(historyIndex + 1, history.length - 1));
    } else if (e.key === "ArrowDown" && historyIndex > 0) {
        e.preventDefault();
        recallHistory(historyIndex - 1);
    } else if (e.key === "ArrowDown" && historyIndex === 0) {
        e.preventDefault();
        historyIndex = -1;
        showInput("");
    }
});
