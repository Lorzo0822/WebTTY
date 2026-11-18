// wrote in the most basic javascript for supporting almost every browser

var menu = document.getElementById("menu");
var comment = document.getElementById("comment");
var click = document.getElementById("click");
var nodeList = menu.getElementsByTagName("a");
var links = [];
var selectedIndex = 0;
var i;
var openKP = false;
var STORAGE_KEY = "grubConfig";

var defaultGrubConfig = {
  kernelParams: ["quiet", "splash", "ro"],
  polyfillCategories: {
    es6Strings: false, // .startsWith(), .endsWith(), .includes()
    es6Arrays: false   // Array.from(), .find()
  }
};

function cloneConfig(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function loadGrubConfig() {
  var config = cloneConfig(defaultGrubConfig);
  var saved, key;

  try {
    saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return config;
  }

  if (saved && typeof saved === "object") {
    if (Object.prototype.toString.call(saved.kernelParams) === "[object Array]") {
      config.kernelParams = saved.kernelParams;
    }
    if (saved.polyfillCategories) {
      for (key in config.polyfillCategories) {
        if (config.polyfillCategories.hasOwnProperty(key) &&
            typeof saved.polyfillCategories[key] === "boolean") {
          config.polyfillCategories[key] = saved.polyfillCategories[key];
        }
      }
    }
  }
  return config;
}

function saveGrubConfig(config) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    return false;
  }
}

var grubConfig = loadGrubConfig();

function setPolyfill(name, enabled) {
  if (grubConfig.polyfillCategories.hasOwnProperty(name)) {
    grubConfig.polyfillCategories[name] = !!enabled;
    saveGrubConfig(grubConfig);
  }
}

for (i = 0; i < nodeList.length; i++) {
    links.push(nodeList[i]);
}

function setSelected(link, selected) {
    var cls = " " + link.className + " ";
    var has = cls.indexOf(" selection ") !== -1;

    if (selected && !has) {
        link.className = (link.className ? link.className + " " : "") + "selection";
    } else if (!selected && has) {
        link.className = cls.replace(" selection ", " ")
                            .replace(/^\s+|\s+$/g, "");
    }
}

function updateSelection() {
    var j;
    for (j = 0; j < links.length; j++) {
        setSelected(links[j], j === selectedIndex);
    }
}

function hasClass(el, cls) {
    return (" " + el.className + " ").indexOf(" " + cls + " ") > -1;
}

function addClass(el, cls) {
    if (!hasClass(el, cls)) {
        el.className = (el.className ? el.className + " " : "") + cls;
    }
}

function removeClass(el, cls) {
    el.className = (" " + el.className + " ")
        .replace(" " + cls + " ", " ")
        .replace(/^\s+|\s+$/g, "");
}

function openKernelParams() {
    var kp = document.getElementById("kernelParams");
    openKP = !openKP;
    if (openKP) {
        input.value = grubConfig.kernelParams.join(" ");
        resizeInput();
        removeClass(kp, "hide");
        addClass(menu, "hide");
        addClass(comment, "hide");
    } else {
        addClass(kp, "hide");
        removeClass(menu, "hide");
        removeClass(comment, "hide");
    }
}

function onKeyDown(event) {
    event = event || window.event;
    var key = event.key || event.keyCode;

    var isDown = key === "ArrowDown" || key === "Down" || key === 40;
    var isUp = key === "ArrowUp" || key === "Up" || key === 38;
    var isEnter = key === "Enter" || key === 13;
    var isKernelParams = key === "E" || key === "e" || key === 69; //noice
    var isEscape = key === "Escape" || key === "Esc" || key === 27;

    if (openKP && isEscape) {
        if (event.preventDefault) {
            event.preventDefault();
        } else {
            event.returnValue = false;
        }
        openKernelParams();
        return;
    }

    if (openKP) {
        return;
    }

    if (!openKP && isKernelParams) {
        openKernelParams();
        return;
    }

    if (!isDown && !isUp && !isEnter) {
        return;
    }

    if (event.preventDefault) {
        event.preventDefault();
    } else {
        event.returnValue = false;
    }

    if (isEnter) {
        window.location.href = links[selectedIndex].href;
        return;
    }

    if (isDown) {
        selectedIndex = Math.min(selectedIndex + 1, links.length - 1);
    } else {
        selectedIndex = Math.max(selectedIndex - 1, 0);
    }

    updateSelection();
}

if (document.addEventListener) {
    document.addEventListener("keydown", onKeyDown, false);
} else if (document.attachEvent) {
    document.attachEvent("onkeydown", onKeyDown);
}

var input = document.getElementById("inputKernelParam");

function saveKernelParams() {
    var value = input.value.replace(/^\s+|\s+$/g, "");
    grubConfig.kernelParams = value ? value.split(/\s+/) : [];
    saveGrubConfig(grubConfig);
}

function resizeInput() {
    input.style.width = "1px";
    input.style.width = (input.scrollWidth + 5) + "px";
}

if (input.addEventListener) {
    input.addEventListener("input", function () {
        resizeInput();
        saveKernelParams();
    }, false);
} else if (input.attachEvent) {
    input.attachEvent("onkeyup", function () {
        resizeInput();
        saveKernelParams();
    });
} else {
    input.onkeyup = function () {
        resizeInput();
        saveKernelParams();
    };
}

input.value = grubConfig.kernelParams.join(" ");
resizeInput();

updateSelection();
