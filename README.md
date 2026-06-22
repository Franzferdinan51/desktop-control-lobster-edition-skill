# Newest Desktop Control

One MCP server for agent control across macOS, Linux, Windows, Codex Computer Use, and Android devices.

This repo replaces the older `desktop-control-lobster-edition-skill` Python skill layout with a consolidated Node.js MCP gateway. It merges the useful desktop-control surface from `gui-control-lobster`, `computer-use-lobster`, and `computer-use-tool`, then adds Android ADB controls and Codex Computer Use detection.

## What This Gives Agents

- Desktop screenshots, mouse, keyboard, clipboard, screen, pixel, app launch, terminal, file, and window activation tools.
- Compatibility aliases for the older `screenshot`, `mouse_click`, `keyboard`, and `computer_use_*` tool names.
- Android phone and emulator control through ADB: screenshots, taps, swipes, text input, key events, app launch, UI dump, logcat, screen size, and focused activity.
- Codex Computer Use discovery and ready-to-use MCP config generation for the supported `SkyComputerUseClient mcp` entry point.
- Diagnostics for dependencies, permissions, and backend availability.

## Important Boundary

Codex Computer Use is proprietary. This project does not decompile, patch, re-sign, copy, or bypass the Codex app bundle. It detects supported integration points and exposes fallback desktop controls through macOS utilities and PyAutoGUI.

The desktop, terminal, file-write, and Android tools are powerful. Only expose this MCP server to agents and clients you trust.

## Quick Start

```bash
npm test
npm run status
npm start
```

The server speaks JSON-RPC over stdio, as expected by Codex and other MCP clients.

## Quick Install (any agent framework)

```bash
git clone https://github.com/Franzferdinan51/desktop-control-lobster-edition-skill.git
cd desktop-control-lobster-edition-skill
bash scripts/install.sh --target hermes
```

The installer detects your OS, installs Python dependencies, runs the test
suite as a smoke check, and prints a ready-to-paste MCP config snippet for
your agent framework.

### Per-framework one-liners

```bash
npm run setup:openclaw         # OpenClaw / DuckBot / generic gateway
npm run setup:hermes           # Hermes Agent (NousResearch)
npm run setup:codex            # OpenAI Codex CLI (TOML block)
npm run setup:claude-desktop   # Anthropic Claude Desktop
npm run setup:all              # every target at once
```

Each target also accepts `--out <file>` to write the config to disk. See
`node scripts/setup-config.js --help` for all options.

### Verify the install

```bash
npm run verify      # prints desktop / android / codex backend status
npm test            # runs the 38-test suite
npm run check       # full pre-flight health check (Node, Python, deps, server, tests)
npm run inspect     # interactive REPL for calling tools
npm run inspect:list # list every registered tool
```

## Requirements

- Node.js 18 or newer.
- macOS, Linux, or Windows for desktop automation.
- Python 3 with PyAutoGUI, Pillow, pygetwindow, pytesseract, screeninfo, and psutil.
- ADB for Android controls.
- Codex.app on macOS if you want Codex Computer Use detection.

The `scripts/install.sh` script installs the Python dependencies from
`requirements.txt`. If you'd rather do it manually:

```bash
python3 -m pip install -r requirements.txt   # On Windows, use 'python' instead of 'python3'
```

Check Android availability:

```bash
adb devices -l
```

For physical Android phones, enable Developer Options and USB debugging. For emulators, start the emulator before calling Android tools.

### Platform Notes

macOS uses `screencapture`, `pbcopy`, `pbpaste`, `open`, and `osascript` where available.

Linux uses PyAutoGUI for screen/input automation and native command-line tools for desktop integration:

- `xdg-open` for app/path/URL launch.
- `wmctrl` for window list and activation.
- `wl-copy`/`wl-paste`, `xclip`, or `xsel` for clipboard.

Windows uses PyAutoGUI for screen/input automation and PowerShell/cmd for desktop integration:

- `powershell.exe` for clipboard, terminal commands, and window helpers.
- `cmd.exe start` for app/path/URL launch.

Window activation depends on the desktop environment and OS focus rules. Some Linux Wayland compositors and Windows elevated/non-elevated app boundaries may block focus changes.

## Codex MCP Config

The fastest way to get a Codex-ready config is:

```bash
npm run setup:codex
```

Or generate it manually and append to `~/.codex/config.toml`:

```toml
[mcp_servers.newest-desktop-control]
command = "node"
args = ["/absolute/path/to/desktop-control-lobster-edition-skill/src/server.js"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

From this repo on the original machine, the path was:

```toml
[mcp_servers.newest-desktop-control]
command = "node"
args = ["/Users/duckets/Desktop/Newest Desktop Control/src/server.js"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

You can also ask the server for the detected Codex Computer Use MCP config:

```json
{
  "method": "tools/call",
  "params": {
    "name": "codex_mcp_config",
    "arguments": {}
  }
}
```

## Tool Groups

Canonical tools are namespaced by backend. Compatibility aliases are kept so older agents do not have to change prompts immediately.

### Desktop

- `desktop_screenshot`
- `desktop_mouse_move`
- `desktop_mouse_click`
- `desktop_mouse_scroll`
- `desktop_mouse_drag`
- `desktop_ocr`
- `desktop_keyboard_type`
- `desktop_keyboard_press`
- `desktop_keyboard_hotkey`
- `desktop_keyboard`
- `desktop_cursor_position`
- `desktop_get_screen_size`
- `desktop_get_pixel_color`
- `desktop_clipboard_read`
- `desktop_clipboard_write`
- `desktop_launch_app`
- `desktop_window_list`
- `desktop_window_activate`
- `desktop_run_script`
- `desktop_file_read`
- `desktop_file_write`
- `desktop_terminal`
- `desktop_rs_lookup`

### Desktop Compatibility Aliases

- `screenshot`
- `mouse_move`
- `mouse_click`
- `mouse_scroll`
- `keyboard_type`
- `keyboard_press`
- `keyboard_hotkey`
- `keyboard`
- `cursor_position`
- `get_screen_size`
- `get_pixel_color`
- `clipboard_read`
- `clipboard_write`
- `launch_app`
- `window_list`
- `window_activate`
- `run_script`
- `file_read`
- `file_write`
- `terminal`
- `rs_lookup`

### Computer Use Compatibility Aliases

- `computer_use_screenshot`
- `computer_use_mouse_move`
- `computer_use_mouse_click`
- `computer_use_mouse_scroll`
- `computer_use_keyboard`
- `computer_use_cursor_position`
- `computer_use_launch_app`

### Android

- `android_devices`
- `android_screenshot`
- `android_screen_size`
- `android_current_activity`
- `android_tap`
- `android_swipe`
- `android_text`
- `android_key`
- `android_launch_app`
- `android_ui_dump`
- `android_logcat`

### Diagnostics

- `backend_status`
- `codex_mcp_config`
- `permissions_check`

## Desktop Permissions

Operating systems may block screenshots and input automation until the host process has permission.

On macOS, grant permissions to the app or terminal that launches this MCP server:

- Screen Recording: required for screenshots.
- Accessibility: required for mouse and keyboard automation.
- Automation: may be required for AppleScript window activation.

After changing permissions, restart the MCP client or terminal.

On Linux, PyAutoGUI requires access to the active graphical session. Wayland environments may require compositor-specific permissions or XWayland fallback.

On Windows, run the MCP server in the same user session as the apps you want to control. Elevated apps may not accept input from a non-elevated MCP server.

## Why MCP

MCP is the right outer protocol for this project because Codex and other agent clients can load MCP servers directly. The current Codex app also packages Computer Use as an MCP server entry, so this gateway follows the supported shape instead of trying to reverse engineer private internals.

The routing model is:

- Use Codex Computer Use when its supported `SkyComputerUseClient mcp` command is available.
- Use local OS commands and PyAutoGUI controls for desktop fallback and compatibility.
- Use ADB for phones and Android emulators.

## Development

Run the test suite:

```bash
npm test
```

Check backend availability:

```bash
npm run status
```

Run the full pre-flight health check (Node, Python, pip, Python deps, ADB,
server boot, and the test suite):

```bash
npm run check
npm run check -- --json     # JSON output for CI / agent workflows
npm run check -- --no-tests # skip the test-suite step
```

Start the MCP server:

```bash
npm start
```

Generate MCP config snippets for any agent framework:

```bash
npm run setup:openclaw
npm run setup:hermes
npm run setup:codex
npm run setup:claude-desktop
npm run setup:all
```

Run the cross-platform installer (also accepts a target):

```bash
bash scripts/install.sh
bash scripts/install.sh --target hermes
```

Try out tools interactively:

```bash
npm run inspect          # REPL: prompt for tool + JSON args
npm run inspect:list     # list every registered tool
node scripts/inspect.js desktop_screenshot '{}'   # one-shot call
node scripts/inspect.js --server                  # boot server in --status mode
```

The implementation is intentionally small:

- `src/server.js` handles MCP JSON-RPC over stdio.
- `src/tools.js` defines tools, aliases, and routing.
- `src/backends/desktop.js` implements macOS, Linux, Windows, and PyAutoGUI-backed controls.
- `src/backends/android.js` implements ADB-backed controls.
- `src/backends/codex.js` detects Codex Computer Use and emits supported config.
- `scripts/pyautogui_action.py` performs PyAutoGUI actions from Node.
- `scripts/install.sh` and `scripts/setup-config.js` handle OS detection,
  dependency install, and per-framework MCP config generation.
- `scripts/check.sh` is the pre-flight health check.
- `scripts/inspect.js` is the interactive tool-caller.

For an **AI agent integrating with this server**, see
[`docs/AGENTS.md`](docs/AGENTS.md). It covers tool groupings, safety
guidance, and worked examples.

## Status

Validated locally with:

```bash
npm test
npm run status
npm run check
```

The test suite covers MCP initialization compatibility, tool registration, alias routing, Android command construction, Android parsers, Codex config generation, env-overridable RS helper resolution, the new 7-tool desktop expansion (hover / right / middle / focus / screenshot-window / get-window-info / wait-for-image), the setup-config CLI for all six targets, and the inspect.js CLI for the read-only subset.
