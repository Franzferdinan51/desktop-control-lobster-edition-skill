# Newest Desktop Control

[![CI](https://github.com/Franzferdinan51/desktop-control-lobster-edition-skill/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Franzferdinan51/desktop-control-lobster-edition-skill/actions/workflows/ci.yml)

A cross-platform MCP server that gives AI agents one desktop-control surface for **macOS, Linux, Windows, Android, Codex, Hermes, OpenClaw, and other MCP clients**.

Newest Desktop Control combines normal foreground desktop automation, native window management, Android ADB control, and an optional CUA backend for accessibility-driven background control where the user's real mouse does not need to move.

## What it does

- Capture desktop or individual-window screenshots.
- Move, click, drag, scroll, hover, right-click, and middle-click the mouse.
- Type text, press keys, and send hotkeys.
- Read/write the clipboard.
- Read pixels, screen size, monitors, processes, and active-window information.
- List, focus, minimize, maximize, restore, move, resize, and close windows.
- Launch applications, paths, and URLs.
- Run local scripts and shell commands and read/write local files.
- Find screen images and wait for UI images to appear.
- OCR visible UI text.
- Control Android phones and emulators through ADB.
- Use optional `cua-driver` tools for accessibility-tree/SOM control without normal cursor movement.
- Generate ready-to-paste MCP configuration for Hermes, OpenClaw, Codex CLI, Claude Desktop, and generic MCP clients.
- Report backend, dependency, and permission status.

## Architecture

```text
                  MCP client / AI agent
                         |
                         v
                  src/server.js
                         |
                  src/tools.js
              _________|__________
             /         |          \
            v          v           v
       Desktop       Android       CUA
       backend        ADB       cua-driver
          |
    ______|____________________________
   /             |           |         \
macOS          Linux       Windows   PyAutoGUI
System Events  wmctrl       Win32    screen/input
```

The ordinary desktop backend is intended for broad compatibility. CUA is optional and exists for agents that need structured accessibility data or background-style interaction.

## Quick start

```bash
git clone https://github.com/Franzferdinan51/desktop-control-lobster-edition-skill.git
cd desktop-control-lobster-edition-skill
bash scripts/install.sh --target hermes
```

The installer checks the host OS, installs Python dependencies, runs the test suite, and prints an MCP configuration for the requested agent framework.

Then verify the installation:

```bash
npm run check
npm run status
npm test
```

Start the MCP server directly with:

```bash
npm start
```

The server communicates over JSON-RPC/MCP using stdio.

## Generate MCP configuration

```bash
npm run setup:openclaw
npm run setup:hermes
npm run setup:codex
npm run setup:claude-desktop
npm run setup:all
```

You can also call the generator directly:

```bash
node scripts/setup-config.js --help
node scripts/setup-config.js hermes
node scripts/setup-config.js codex
```

### Codex CLI example

```toml
[mcp_servers.newest-desktop-control]
command = "node"
args = ["/absolute/path/to/desktop-control-lobster-edition-skill/src/server.js"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

## Requirements

### Core

- Node.js 18 or newer.
- Python 3.
- Python packages from `requirements.txt`.
- A graphical desktop session for normal PyAutoGUI interaction.

Install Python dependencies manually if needed:

```bash
python3 -m pip install -r requirements.txt
```

On Windows use `python` instead of `python3` if that is how Python is installed.

### macOS

The backend uses native macOS facilities where they are more reliable than generic Python wrappers:

- `screencapture` for screenshots.
- `System Events` / AppleScript for window discovery and management.
- `pbcopy` / `pbpaste` for clipboard access.
- `open` for launching applications, files, and URLs.

Grant **Screen Recording** and **Accessibility** permissions to the application or terminal that launches the MCP server. AppleScript window operations may also require Automation permission.

### Linux

Linux uses:

- PyAutoGUI for normal screen/input automation.
- `wmctrl` for native window listing, activation, movement, resize, minimize/maximize/restore, and close operations.
- `xdg-open` for launching paths and URLs.
- `wl-copy`/`wl-paste`, `xclip`, or `xsel` for clipboard access.

Install `wmctrl` if it is missing. Example on Debian/Ubuntu:

```bash
sudo apt install wmctrl
```

Wayland compositors can intentionally restrict global input, screenshots, or window manipulation. X11/XWayland generally exposes more of this functionality.

### Windows

Windows uses:

- PyAutoGUI for normal screen/input automation.
- PowerShell plus Win32 APIs for native window discovery, focus, move, resize, minimize, maximize, restore, and close operations.
- PowerShell for clipboard access and shell integration.
- `cmd.exe start` for launching applications, paths, and URLs.

The MCP server should normally run in the same user/elevation session as the applications being controlled. Windows security boundaries can prevent a non-elevated process from manipulating an elevated application.

## Window management

Window management is handled by the operating system backend rather than depending on `PyGetWindow` as a universal abstraction.

Supported operations include:

```text
desktop_get_all_windows
desktop_get_window_info
desktop_focus_window
desktop_window_activate
desktop_screenshot_window
desktop_minimize_window
desktop_maximize_window
desktop_restore_window
desktop_move_window
desktop_resize_window
desktop_close_window
```

Window matching is title-based for the public MCP schemas, with partial-title matching used where the platform allows it. Internal backend paths can also resolve PIDs where available.

`desktop_screenshot_window` resolves native window geometry first, then captures only that screen region instead of relying on PyGetWindow's platform support.

Window managers and operating systems still have the final say. A Wayland compositor, macOS privacy setting, Windows integrity boundary, or application-specific restriction can reject an otherwise valid operation.

## CUA / background desktop control

The optional CUA backend wraps [`trycua/cua`](https://github.com/trycua/cua) `cua-driver`.

Unlike the normal PyAutoGUI path, CUA can work from platform accessibility information and can target elements using structured handles instead of only screen coordinates.

Install it with:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"
```

Then verify:

```bash
cua-driver --version
npm run status
```

On macOS grant Accessibility and Screen Recording permissions to `/Applications/CuaDriver.app`.

If the driver lives somewhere unusual, set:

```bash
export NEWEST_DC_CUA_DRIVER=/custom/path/to/cua-driver
```

The backend resolves the actual driver path and passes that resolved path through to the Python CUA shim, so Homebrew, `/usr/local`, `~/.local/bin`, and explicit overrides are handled consistently.

Important CUA tools include:

```text
desktop_ax_tree
desktop_list_apps
desktop_som_capture
desktop_click_element
desktop_drag_element
desktop_type_into
desktop_key_combo
desktop_focus_app
desktop_launch_app_cua
desktop_kill_app
desktop_screenshot_prompt_guard
desktop_evict_screenshots
```

A useful agent loop is:

```text
1. desktop_list_apps
2. desktop_som_capture(pid=...)
3. inspect element_index values
4. desktop_click_element(pid=..., element_index=...)
5. optionally capture_after=true for verification
```

## Android

Android control uses ADB and works with physical phones or emulators.

Check connectivity:

```bash
adb devices -l
```

For physical devices, enable Developer Options and USB debugging.

Available Android tools include:

```text
android_devices
android_screenshot
android_screen_size
android_current_activity
android_tap
android_swipe
android_text
android_key
android_launch_app
android_ui_dump
android_logcat
```

## Desktop tools

The normal desktop tool set includes:

```text
desktop_screenshot
desktop_mouse_move
desktop_mouse_click
desktop_mouse_scroll
desktop_mouse_drag
desktop_mouse_double_click
desktop_mouse_hover
desktop_mouse_right_click
desktop_mouse_middle_click

desktop_keyboard_type
desktop_keyboard_press
desktop_keyboard_hotkey
desktop_keyboard
desktop_key_down
desktop_key_up

desktop_cursor_position
desktop_get_screen_size
desktop_get_pixel_color
desktop_get_monitors

desktop_get_active_window
desktop_get_all_windows
desktop_get_window_info
desktop_focus_window
desktop_window_list
desktop_window_activate
desktop_minimize_window
desktop_maximize_window
desktop_restore_window
desktop_move_window
desktop_resize_window
desktop_close_window
desktop_screenshot_window

desktop_find_image
desktop_wait_for_image
desktop_ocr

desktop_clipboard_read
desktop_clipboard_write
desktop_launch_app
desktop_run_script
desktop_file_read
desktop_file_write
desktop_terminal
desktop_list_processes
desktop_kill_process
```

Compatibility aliases are retained for older prompts and integrations, including names such as `screenshot`, `mouse_click`, `keyboard`, `launch_app`, and `computer_use_*`.

List the exact tool registry on your installed version with:

```bash
npm run inspect:list
```

## Diagnostics

```bash
npm run status
npm run check
npm run check -- --json
npm run check -- --no-tests
npm run inspect
npm run inspect:list
```

The diagnostic MCP tools are:

```text
backend_status
permissions_check
codex_mcp_config
```

`backend_status` reports desktop, CUA, Android, and Codex availability along with relevant platform capability details.

## Safety

This server exposes powerful capabilities: input control, process termination, shell execution, file writes, and Android device access.

Do not expose it to untrusted remote clients or agents.

A few protections are built in:

- `desktop_kill_app` blocks PID 1 and reserved/system PID ranges.
- CUA screenshot prompt guarding can scan visible text for common prompt-injection patterns.
- CUA screenshot history can be explicitly evicted to reduce unnecessary image/context retention.
- Tool calls return MCP error results instead of intentionally crashing the server on ordinary handler failures.

These protections do **not** turn arbitrary shell or desktop control into a sandbox. The security boundary is still the OS account running the MCP server.

## Codex Computer Use boundary

Codex Computer Use is proprietary. This project does not decompile, patch, re-sign, copy, or bypass the Codex application bundle.

The Codex backend detects supported integration points and can generate compatible MCP configuration. Normal desktop functionality remains available independently through the local desktop backend.

## Development

Run everything before committing:

```bash
npm test
npm run status
npm run check
```

Useful developer commands:

```bash
npm run inspect
npm run inspect:list
node scripts/inspect.js desktop_get_screen_size '{}'
node scripts/inspect.js --server
```

The main implementation files are:

```text
src/server.js                MCP JSON-RPC server
src/tools.js                 tool schemas, aliases, routing
src/backends/desktop.js      desktop + native window management
src/backends/android.js      ADB backend
src/backends/codex.js        Codex detection/config
src/backends/cua.js          CUA backend
scripts/pyautogui_action.py   PyAutoGUI helper
scripts/cua_action.py         cua-driver helper
scripts/setup-config.js       MCP config generator
scripts/install.sh            installer
scripts/check.sh              health checker
scripts/inspect.js            interactive tool inspector
```

For agent-facing integration guidance, see [`docs/AGENTS.md`](docs/AGENTS.md).

## Testing and CI

`main` is checked by GitHub Actions on every push and pull request.

CI currently covers the Node test suite, Python helper compilation, dependency health, MCP initialization, tool registration, alias routing, Android command construction/parsing, CUA routing and safety behavior, configuration generation, CLI behavior, and regression checks for machine-specific path leakage.

Some live GUI/CUA checks are intentionally skipped in the headless Linux runner because they require a real graphical desktop or an installed `cua-driver`. Run `npm run check` on the target machine to validate those host-specific capabilities.

## License / project status

This is an actively developed agent-control project. Treat OS desktop automation as inherently environment-dependent: operating-system updates, desktop environments, permissions, and security boundaries can change what a host allows.

Bug reports and targeted platform fixes are welcome.
