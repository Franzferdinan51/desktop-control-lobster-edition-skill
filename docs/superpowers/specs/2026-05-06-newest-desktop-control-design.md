# Newest Desktop Control Design

## Goal

Build `Desktop/Newest Desktop Control` as a consolidated device-control gateway for agents. It exposes one MCP server while routing actions to desktop backends, the Codex Computer Use MCP entry point when available, and Android devices through ADB.

## Scope

The first version consolidates the three local Desktop control projects into one clean server rather than preserving three separate servers. It implements desktop screenshot, mouse, keyboard, clipboard, screen info, window list, and window activation tools. It also adds Android device controls for connected phones and emulators: device list, screenshot, tap, swipe, text input, key events, app launch, UI dump, and logcat capture.

The Codex Computer Use integration uses the installed plugin's supported MCP command when it is available. It does not decompile, patch, or bypass the proprietary Codex app bundle or its hardened runtime restrictions.

## Architecture

The server is a Node.js stdio MCP process. `src/server.js` handles JSON-RPC framing and MCP lifecycle. `src/tools.js` defines the public tool catalog and routes tool calls. `src/backends/desktop.js` implements macOS and PyAutoGUI-backed desktop actions. `src/backends/android.js` implements ADB-backed phone and emulator actions. `src/backends/codex.js` detects and reports the installed Codex Computer Use backend and leaves proxying behind a capability check because the binary is launch-context sensitive.

Tool names are intentionally explicit for safety. Desktop tools use `desktop_*`, Android tools use `android_*`, and compatibility aliases keep the older local names working for existing agents.

## Public Tool Surface

Desktop tools:

- `desktop_screenshot`
- `desktop_mouse_move`
- `desktop_mouse_click`
- `desktop_mouse_scroll`
- `desktop_keyboard_type`
- `desktop_keyboard_press`
- `desktop_keyboard_hotkey`
- `desktop_cursor_position`
- `desktop_get_screen_size`
- `desktop_get_pixel_color`
- `desktop_clipboard_read`
- `desktop_clipboard_write`
- `desktop_window_list`
- `desktop_window_activate`

Android tools:

- `android_devices`
- `android_screenshot`
- `android_tap`
- `android_swipe`
- `android_text`
- `android_key`
- `android_launch_app`
- `android_ui_dump`
- `android_logcat`

Diagnostics:

- `backend_status`
- `permissions_check`

Compatibility aliases:

- `screenshot`, `mouse_move`, `mouse_click`, `mouse_scroll`, `keyboard_type`, `keyboard_press`, `keyboard_hotkey`, `cursor_position`, `get_screen_size`, `get_pixel_color`, `clipboard_read`, `clipboard_write`, `window_list`, `window_activate`

## Error Handling

Tool failures return MCP tool results with `isError: true` and a concise text explanation. Missing dependencies are reported directly: unavailable `adb`, missing Python or PyAutoGUI, missing macOS permissions, or unavailable Codex Computer Use binary.

## Testing

Use Node's built-in `node:test` runner. Tests cover tool registration, compatibility alias routing, Android ADB command construction, device argument placement, and status reporting. Runtime desktop and Android actions are smoke-tested through `npm test` and `npm run status`; physical device interaction depends on local macOS permissions and connected ADB devices.

## Security

The gateway avoids hidden reverse engineering. It uses supported system interfaces: MCP, macOS command-line utilities, PyAutoGUI, AppleScript, and ADB. Agents receive explicit Android and desktop tool names to reduce accidental cross-device actions. Browser-specific and app-specific structured integrations remain preferred when available; raw GUI control is the fallback for visual or cross-app workflows.
