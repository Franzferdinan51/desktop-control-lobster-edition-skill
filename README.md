# Newest Desktop Control

Consolidated MCP gateway for agent desktop and Android control.

## What It Combines

- Desktop control from the local `gui-control-lobster`, `computer-use-lobster`, and `computer-use-tool` projects.
- Codex Computer Use detection through the installed Codex app bundle's supported MCP command.
- Android phone and emulator control through ADB.

The Codex Computer Use binary is proprietary. This project detects and uses supported integration points; it does not decompile, patch, or bypass the Codex app bundle.

## Run

```bash
npm test
npm run status
npm start
```

## MCP Config

```toml
[mcp_servers.newest-desktop-control]
command = "node"
args = ["/Users/duckets/Desktop/Newest Desktop Control/src/server.js"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

## Tools

Desktop tools include screenshots, mouse, keyboard, clipboard, screen info, app launch/open, window activation, local script execution, file read/write, terminal commands, and the local RuneScape lookup helper with `desktop_*` names. Compatibility aliases such as `screenshot`, `mouse_click`, `keyboard_type`, `keyboard`, `launch_app`, `terminal`, `file_read`, and `run_script` map to the desktop tools.

The legacy `computer_use_*` aliases from `computer-use-tool` are also preserved: `computer_use_screenshot`, `computer_use_mouse_move`, `computer_use_mouse_click`, `computer_use_mouse_scroll`, `computer_use_keyboard`, `computer_use_cursor_position`, and `computer_use_launch_app`.

Android tools include `android_devices`, `android_screenshot`, `android_screen_size`, `android_current_activity`, `android_tap`, `android_swipe`, `android_text`, `android_key`, `android_launch_app`, `android_ui_dump`, and `android_logcat`.

Diagnostics include `backend_status`, `codex_mcp_config`, and `permissions_check`.

## Why MCP

MCP is the right outer protocol for this project because Codex and other agent clients can consume MCP servers directly, and Codex Computer Use itself is packaged with an MCP server entry in the installed app bundle. This gateway keeps one stable MCP surface while routing to the best available backend:

- Codex Computer Use: expose supported config and status for `SkyComputerUseClient mcp`.
- Local desktop control: use macOS commands and PyAutoGUI-compatible tools from the three Desktop control projects.
- Android control: use ADB, which is the supported automation surface for phones and emulators.

The project does not decompile, patch, re-sign, or bypass proprietary Codex binaries. If Codex Computer Use is unavailable because of launch constraints or permissions, the local desktop backend remains available as the fallback.

## Requirements

Desktop control on macOS may require Screen Recording and Accessibility permissions for the terminal or host app running this server. PyAutoGUI actions require Python dependencies:

```bash
python3 -m pip install pyautogui pillow
```

Android control requires ADB:

```bash
adb devices -l
```

Enable Developer Options and USB debugging on phones, or start an Android emulator.
