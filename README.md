# WebTTY
<img align="right" width="180" src="./docs/assets/tux.svg" alt="ASCII Art">

A complete Linux simulation inside your browser, built entirely in HTML5 with support from ES5 to modern browsers.

Features:
- **Persistent filesystem** using IndexedDB
- Most **common commands fully simulated**
- A **custom package manager** for community-driven PPAs
- **Community-driven PPAs**
- **Custom programming language**

<br clear="left"/>

### TODO list
- [ ] Add custom programming language
- [x] ~~Add basic apt~~
- [ ] Translate to ES5
- [ ] Add more commands
- [ ] Make a DE (Desktop Environment)
- [ ] Add polyfills

## Index
- [README](.)
- [Commands list](./docs/commands.md)
- [Requirements](./docs/requirements.md)
- [Making your own PPA](./docs/making-own-PPA.md)

<hr>

# Where is it?
Before continuing, please verify your browser compatibility [here](./docs/requirements.md).

## Online webpage
You can visit [GitHub Pages](https://lorzo0822.github.io/WebTTY/linux) and choose between the legacy version (for older browsers supporting ES5) and the modern version (using modern JavaScript).

## Using a local server on your device
You can download the repository and run a local server on your device to host the files (e.g., `python -m http.server`). [Direct Download link](https://github.com/Lorzo0822/WebTTY/archive/refs/heads/main.zip)

## Using a single file without a server
You can use an all-in-one HTML file for plug-and-play use directly in your browser. Be aware that it may not always be up to date with the latest source code, as I build releases manually. Every time a new update is released, you will have to download it again since I have no access to your local storage (though you will be notified about new releases). Downloadable from [the latest release](https://github.com/Lorzo0822/WebTTY/releases/latest).

<hr>

### License
This project is released under the [MIT License](./LICENSE).
