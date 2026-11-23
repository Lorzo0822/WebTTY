const canvas = document.getElementById('display');
const ctx = canvas.getContext('2d');

function renderScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function clearScreen() {
    renderScreen();
    lines = 10;
    cursorX = column;
    resetInputHistory();
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    renderScreen();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Shapes

function drawSquare(x, y, width, height, hex) {
    ctx.fillStyle = hex;
    ctx.fillRect(x, y, width, height);
}

function drawLine(startx, starty, endx, endy, width, hex) {
    ctx.beginPath();
    ctx.moveTo(startx, starty);
    ctx.lineTo(endx, endy);
    ctx.strokeStyle = hex;
    ctx.lineWidth = width;
    ctx.stroke();
}

function drawCircle(x, y, radius, hex, startAngle = 0, endAngle = Math.PI * 2) {
    ctx.beginPath();
    ctx.arc(x, y, radius, startAngle, endAngle);
    ctx.fillStyle = hex;
    ctx.fill();
}

let column = 10;     // Margine sinistro
let lines = 10;      // Riga Y corrente
let cursorX = 10;    // Posizione X corrente del cursore
const inputHistory = [];

function drawInputCharacter(char, size = 16, font = "monospace", color = "#ffffff") {
    ctx.font = `${size}px ${font}`;
    ctx.textBaseline = "top";
    const lineHeight = size + 6;
    const width = ctx.measureText(char).width;
    const before = { x: cursorX, y: lines };

    if (cursorX + width > canvas.width - column && cursorX > column) {
        cursorX = column;
        lines += lineHeight;
    }

    lines = ensureVisible(lines, lineHeight, (scrollAmount) => {
        before.y -= scrollAmount;
    });

    const position = { x: cursorX, y: lines, width, height: lineHeight, before };
    ctx.fillStyle = color;
    ctx.fillText(char, cursorX, lines);
    cursorX += width;
    inputHistory.push(position);
}

function eraseInputCharacter() {
    const previous = inputHistory.pop();
    if (!previous) return false;
    ctx.clearRect(previous.x - 1, previous.y - 1, previous.width + 2, previous.height + 2);
    cursorX = previous.before.x;
    lines = previous.before.y;
    return true;
}

function resetInputHistory() {
    inputHistory.length = 0;
}

function scrollScreen(lineHeight) {
    const shift = Math.min(lineHeight, canvas.height);
    if (shift <= 0) return;
    const remainingHeight = canvas.height - shift;
    if (remainingHeight > 0) {
        const image = ctx.getImageData(0, shift, canvas.width, remainingHeight);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.putImageData(image, 0, 0);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    lines = Math.max(0, lines - shift);
    for (const entry of inputHistory) {
        entry.y -= shift;
        entry.before.y -= shift;
    }
}

function ensureVisible(y, lineHeight, onScroll) {
    while (y + lineHeight > canvas.height && canvas.height > 0) {
        scrollScreen(lineHeight);
        y = Math.max(0, y - lineHeight);
        onScroll?.(lineHeight);
        if (canvas.height <= lineHeight) break;
    }
    return y;
}

function drawText(text, newLine = true, defaultHex = "#ffffff", size = 16, font = "monospace", x = -1, y = -1) {
    ctx.font = `${size}px ${font}`;
    ctx.textBaseline = "top";

    const margin = (x === -1) ? column : x;
    const maxWidth = ctx.canvas.width - margin;
    const lineHeight = size + 6;

    // Se x è -1 usa la posizione attuale del cursore (cursorX) invece di ripartire sempre dal margine
    let currentX = (x === -1) ? cursorX : x;
    let currentY = (y === -1) ? lines : y;

    const parts = text.split(/(\$#[0-9a-fA-F]{6}|\$#)/g);
    ctx.fillStyle = defaultHex;

    for (const part of parts) {
        if (!part) continue;

        if (part === "$#") {
            ctx.fillStyle = defaultHex;
            continue;
        } else if (part.startsWith("$#")) {
            ctx.fillStyle = "#" + part.slice(2);
            continue;
        }

        const textLines = part.split("\n");

        for (let i = 0; i < textLines.length; i++) {
            if (i > 0) {
                currentX = margin;
                currentY += lineHeight;
                currentY = ensureVisible(currentY, lineHeight);
            }

            const tokens = textLines[i].split(/(\s+)/);

            for (const token of tokens) {
                if (!token) continue;
                const tokenWidth = ctx.measureText(token).width;

                if (currentX + tokenWidth > maxWidth && currentX > margin) {
                    currentX = margin;
                    currentY += lineHeight;
                    currentY = ensureVisible(currentY, lineHeight);
                    if (token.trim() === "") continue;
                }

                if (tokenWidth > maxWidth) {
                    for (const char of token) {
                        const charWidth = ctx.measureText(char).width;
                        if (currentX + charWidth > maxWidth && currentX > margin) {
                            currentX = margin;
                            currentY += lineHeight;
                            currentY = ensureVisible(currentY, lineHeight);
                        }
                        ctx.fillText(char, currentX, currentY);
                        currentX += charWidth;
                    }
                } else {
                    ctx.fillText(token, currentX, currentY);
                    currentX += tokenWidth;
                }
            }
        }
    }

    currentY = ensureVisible(currentY, lineHeight);

    // Aggiorna la posizione per la chiamata successiva
    if (y === -1) {
        if (newLine) {
            lines = currentY + lineHeight;
            cursorX = margin; // Torna a capo a sinistra
        } else {
            lines = currentY;
            cursorX = currentX; // Resta sulla stessa riga per il prossimo carattere
        }
    }
}


export { drawCircle, drawLine, drawSquare, drawText, clearScreen, drawInputCharacter, eraseInputCharacter, resetInputHistory };
