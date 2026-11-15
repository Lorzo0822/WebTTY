# WebTTY
A complete Linux simulation inside your browser.

## Project structure

```text
.
├── assets/                   # Default virtual filesystem and image assets
│   ├── base_filesystem.json  # Initial files/directories loaded by the simulator
│   └── images/
│       └── tux.png           # Tux image asset
├── fonts/
│   └── FSEX302.ttf           # Font used by the GRUB-style menu
├── index.html                # Startup menu for choosing a simulator mode
├── LICENSE                  # Project license
├── README.md                # Project overview and documentation
├── scripts/
│   ├── bin/                  # Regular shell command implementations
│   │   ├── cat.js            # Prints file contents
│   │   ├── cd.js             # Changes the working directory
│   │   ├── clear.js          # Clears the terminal display
│   │   ├── echo.js           # Prints text and stored variables
│   │   ├── help.js           # Lists available shell commands
│   │   ├── ls.js             # Lists directory contents
│   │   ├── mkdir.js          # Creates directories
│   │   └── pwd.js            # Prints the working directory
│   ├── boot.js               # Initializes the virtual machine and system actions
│   ├── commands.js           # Parses shell input and dispatches commands
│   ├── draw.js               # Renders terminal text and input on the canvas
│   ├── filesystem.js         # Implements the persistent virtual filesystem
│   ├── grub.js               # Handles keyboard navigation in the startup menu
│   ├── sbin/                  # System command implementations
│   │   ├── poweroff.js       # Simulates shutting down the system
│   │   └── reboot.js         # Reboots the simulator
│   └── TTY.js                # Connects terminal input, output, and commands
├── sims/
│   └── index.html            # HTML page hosting the terminal simulator
├── styles/
│   └── grub.css              # Styles the startup menu
└── tests/
	├── filesystem.browser.html    # Browser test page for filesystem checks
	├── filesystem.browser.js      # Tests filesystem operations and persistence
	└── filesystem.path.test.mjs   # Node tests for virtual path normalization
```
