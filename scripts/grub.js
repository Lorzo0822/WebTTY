const menu = document.getElementById("menu");
const links = Array.from(menu.getElementsByTagName("a"));
var selectedIndex = 0;

function updateSelection() {
    links.forEach((link, index) => {
        link.classList.toggle("selection", index === selectedIndex);
    });
}

document.addEventListener("keydown", function(event) {
    if (event.key === "ArrowDown") {
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, links.length - 1);
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (event.key === "Enter") {
        event.preventDefault();
        window.location.href = links[selectedIndex].href;
        return;
    } else {
        return;
    }

    updateSelection();
});

updateSelection();