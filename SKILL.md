---
name: desktop-control-lobster
description: Desktop and Android control via MCP gateway — screenshots, mouse, keyboard, clipboard, screen, pixel, app launch, terminal, file, window activation, and ADB controls.
metadata:
  openclaw:
    requires:
      bins: ["node"]
      python: ["pyautogui", "pillow", "pygetwindow", "pytesseract", "screeninfo", "psutil"]
    install:
      - id: node
        kind: node
        package: newest-desktop-control
    mcp:
      command: node
      args:
        - "{SKILL_DIR}/src/server.js"
      transport: stdio
      install_hint: |
        Run `bash scripts/install.sh` from the repo root. It detects the OS,
        installs the Python dependencies, runs the smoke tests, and prints
        a ready-to-paste MCP config snippet for OpenClaw, Hermes Agent,
        Codex CLI, Claude Desktop, or any raw MCP client.

        For a one-liner per agent framework:
          npm run setup:openclaw
          npm run setup:hermes
          npm run setup:codex
          npm run setup:claude-desktop
          npm run setup:all
---

# Desktop Control (Lobster Edition)

Consolidated MCP gateway for desktop and Android control across macOS, Linux, Windows, and Android devices.

## Usage

### Quick install (any agent framework)
```bash
git clone https://github.com/Franzferdinan51/desktop-control-lobster-edition-skill.git
cd desktop-control-lobster-edition-skill
bash scripts/install.sh --target hermes
```

The installer detects your OS, installs Python dependencies, runs the test
suite, and prints a ready-to-paste MCP config snippet.

### One-liner per framework
```bash
npm run setup:openclaw         # OpenClaw / DuckBot / generic gateway
npm run setup:hermes           # Hermes Agent (NousResearch)
npm run setup:codex            # OpenAI Codex CLI (TOML block)
npm run setup:claude-desktop   # Anthropic Claude Desktop
npm run setup:all              # every target at once
```

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
