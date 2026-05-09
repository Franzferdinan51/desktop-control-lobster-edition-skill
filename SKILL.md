---
name: desktop-control-lobster
description: Desktop and Android control via MCP gateway — screenshots, mouse, keyboard, clipboard, screen, pixel, app launch, terminal, file, window activation, and ADB controls.
metadata:
  openclaw:
    requires:
      bins: ["node"]
      python: ["pyautogui", "pillow"]
    install:
      - id: node
        kind: node
        package: newest-desktop-control
    mcp:
      command: node
      args:
        - "C:\\Users\\franz\\.openclaw\\workspace\\skills\\desktop-control-lobster\\src\\server.js"
      transport: stdio
---

# Desktop Control (Lobster Edition)

Consolidated MCP gateway for desktop and Android control across macOS, Linux, Windows, and Android devices.

## Usage

### Via mcporter
```bash
mcporter list desktop-control
mcporter call desktop-control.desktop_screenshot
mcporter call desktop-control.desktop_mouse_click x=100 y=200 button=left
```

### Direct MCP (stdio)
```bash
node src/server.js
```

## Tool Groups

### Desktop (20 tools)
- **Screenshots:** `desktop_screenshot`
- **Mouse:** `desktop_mouse_move`, `desktop_mouse_click`, `desktop_mouse_scroll`
- **Keyboard:** `desktop_keyboard_type`, `desktop_keyboard_press`, `desktop_keyboard_hotkey`, `desktop_keyboard`
- **Screen info:** `desktop_cursor_position`, `desktop_get_screen_size`, `desktop_get_pixel_color`
- **Clipboard:** `desktop_clipboard_read`, `desktop_clipboard_write`
- **Apps/Windows:** `desktop_launch_app`, `desktop_window_list`, `desktop_window_activate`
- **System:** `desktop_run_script`, `desktop_file_read`, `desktop_file_write`, `desktop_terminal`
- **Game:** `desktop_rs_lookup`

### Android (11 tools) — requires ADB
- `android_devices`, `android_screenshot`, `android_screen_size`
- `android_current_activity`, `android_tap`, `android_swipe`
- `android_text`, `android_key`, `android_launch_app`
- `android_ui_dump`, `android_logcat`

### Diagnostics
- `backend_status`, `codex_mcp_config`, `permissions_check`

## Compatibility Aliases
Older tool names still work: `screenshot`, `mouse_click`, `keyboard`, `computer_use_*`, etc.

## Requirements
- Node.js 18+
- Python 3 + PyAutoGUI + Pillow (for mouse/keyboard/pixel/screenshot actions)
- ADB (optional, for Android controls)

## Windows Notes
- Clipboard uses PowerShell
- App launch uses `cmd.exe start`
- Window list uses PowerShell `Get-Process`
- Window activation uses `SetForegroundWindow` via PowerShell
- Server auto-detects `python` on Windows (vs `python3` on macOS/Linux)
