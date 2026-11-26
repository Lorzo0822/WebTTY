[← Back](../README.md)

# Requirements
WebTTY works from ES5 all the way to modern browser provided that they support HTML5 and functions like `.startswith()` listed below here, either way you can enable [polyfills](#polyfills) in the grub menu.

| <img style="width:48px;height:48px;object-fit:contain;" src="assets/browsers/chrome.png"> | <img style="width:48px;height:48px;object-fit:contain;" src="assets/browsers/firefox.png"> | <img style="width:48px;height:48px;object-fit:contain;" src="assets/browsers/opera.png"> | <img style="width:48px;height:48px;object-fit:contain;" src="assets/browsers/safari.png"> | <img style="width:48px;height:48px;object-fit:contain;" src="assets/browsers/edge.png"> |
|---|---|---|---|---|
| Chrome| Firefox| Opera| Safari| Microsoft Edge |
| Chromium 56 or 58 | Firefox ~51| Opera 45 | Safari 10.1| Edge 79 |
| H1 2017| 2017| May 2017| Mar 2017| Jan 2020 |

### Required functions (WIP)
- .startswith()
- object

# Polyfills
Polyfills are javascript scripts that "emulate" functions that don't exist on your browser, for example `.startswith()` can be wrote in js to work with very basic javascript.<br>
In WebTTY's grub menu you can press the `e` key to open "kernel parameters" to include one of this category of polyfill. The base parameter is `polyfills={ cat1, cat2...}`, where cat1/2 are the categories listed below here:
- **strings**, includes all strings