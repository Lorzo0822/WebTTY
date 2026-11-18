# WebTTY
A complete Linux simulation inside your browser.

All in HTML5 all the way fron ES5 to modern browsers.
With:
- *persistent filesystem* with indexedDB
- most *common commands fully simulated*
- actual *custom package manager* for comunity driven PPA
- *comunity driven PPAs*
- *custom programming language*

# Where is it?
Before continuing please verify your browser compatibility [here](#requirements).

## Online webpage
You can visit [github pages](https://lorzo0822.github.io/WebTTY) and choose between legacy (for older browser from ES5) and non legacy linux (with modern javascript).

## Using a local server on your device
You can download the repository and run a local server on your device with a local server (e.g. python http.server)

## Using a one file without a server
You can use a all-in-one html file for plug&play use in the browser. Downloadable at [the latest release]()

# Requirements
WebTTY works from ES5 all the way to modern browser provided that they support HTML5 and functions like '.startswith()' listed below here.

| <img style="width:48px;height:48px;object-fit:contain;" src="./assets/images/browsers/chrome.png"> | <img style="width:48px;height:48px;object-fit:contain;" src="./assets/images/browsers/firefox.png"> | <img style="width:48px;height:48px;object-fit:contain;" src="./assets/images/browsers/opera.png"> | <img style="width:48px;height:48px;object-fit:contain;" src="./assets/images/browsers/safari.png"> | <img style="width:48px;height:48px;object-fit:contain;" src="./assets/images/browsers/edge.png"> |
|---|---|---|---|---|
| Chrome| Firefox| Opera| Safari| Microsoft Edge |
| Chromium 59| Firefox 67| Opera 46| Safari 5| Edge 79 |
| June 2017| May 2019| June 2017| June 2010| January 2020 |

### Required functions
- .startswith()
- object