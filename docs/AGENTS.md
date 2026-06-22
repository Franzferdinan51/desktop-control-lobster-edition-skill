# AGENTS.md — Integration Guide for AI Agents

This document is for **AI agents** (LLM-based assistants, automated
tool-callers, code-review bots, etc.) that consume the
`newest-desktop-control` MCP server. It covers how to register the
server, what tools are available, and how to call them safely.

## Quick Start (for agents)

If you're an agent with access to a shell and a tool-calling harness:

```bash
git clone https://github.com/Franzferdinan51/desktop-control-lobster-edition-skill.git
cd desktop-control-lobster-edition-skill
bash scripts/install.sh --target hermes
```

The installer prints a ready-to-paste MCP config snippet for your
framework (Hermes, OpenClaw, Codex, Claude Desktop, or raw MCP) and
exits with code 0 on success.

## Tool Groups

This server exposes **~102 tools** (including compatibility aliases). They
fall into five buckets:

### 1. Desktop (40+ tools)
Direct control of the local desktop on macOS, Linux, or Windows.

| Category | Tools |
|----------|-------|
| **Screenshots** | `desktop_screenshot`, `desktop_screenshot_window` |
| **Mouse** | `desktop_mouse_move`, `desktop_mouse_click`, `desktop_mouse_double_click`, `desktop_mouse_right_click`, `desktop_mouse_middle_click`, `desktop_mouse_hover`, `desktop_mouse_drag`, `desktop_mouse_scroll`, `desktop_scroll_direction` |
| **Keyboard** | `desktop_keyboard_type`, `desktop_keyboard_press`, `desktop_keyboard_hotkey`, `desktop_keyboard`, `desktop_key_down`, `desktop_key_up` |
| **Window** | `desktop_get_active_window`, `desktop_get_all_windows`, `desktop_window_list`, `desktop_window_activate`, `desktop_focus_window`, `desktop_get_window_info`, `desktop_minimize_window`, `desktop_maximize_window`, `desktop_restore_window`, `desktop_close_window`, `desktop_move_window`, `desktop_resize_window` |
| **Screen info** | `desktop_cursor_position`, `desktop_get_screen_size`, `desktop_get_pixel_color`, `desktop_get_monitors` |
| **Clipboard** | `desktop_clipboard_read`, `desktop_clipboard_write` |
| **Apps** | `desktop_launch_app` |
| **Wait / find** | `desktop_wait`, `desktop_wait_for_image`, `desktop_find_image` |
| **OCR** | `desktop_ocr` |
| **System** | `desktop_terminal`, `desktop_run_script`, `desktop_file_read`, `desktop_file_write`, `desktop_list_processes`, `desktop_kill_process` |
| **Game** | `desktop_rs_lookup` (RuneScape, optional helper) |

### 2. CUA — Computer-Use Agent (12 tools, optional)
Background-mode desktop control via [trycua/cua-driver](https://github.com/trycua/cua).
Unlike the desktop tools above, **the user's real cursor never moves** and keyboard
focus stays theirs. Dispatch happens via platform accessibility APIs (AX on macOS,
UIA on Windows, AT-SPI2 on Linux).

**Install:** `bash scripts/install.sh --target cua` (or `curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh | bash`).
Grant Accessibility + Screen Recording to `/Applications/CuaDriver.app` on macOS.

| Category | Tools |
|----------|-------|
| **App discovery** | `desktop_list_apps`, `desktop_focus_app`, `desktop_launch_app_cua` |
| **Accessibility tree** | `desktop_ax_tree` (structured elements + tree_markdown) |
| **SOM capture** | `desktop_som_capture` (screenshot + numbered elements in one call) |
| **Element-indexed actions** | `desktop_click_element`, `desktop_drag_element`, `desktop_type_into` |
| **Hotkey** | `desktop_key_combo` |
| **Guarded actions** | `desktop_kill_app` (refuses pid=1, pid<50, system pids) |
| **Safety** | `desktop_screenshot_prompt_guard` (prompt-injection scan), `desktop_evict_screenshots` (token-aware eviction) |

**Why two backends?** The desktop backend drives the user's real cursor (fine for
full automation tasks when nobody else is using the machine). The CUA backend is
for when the user is actively working — the agent runs alongside, never disturbing
the user's session.

**Env vars:**
- `NEWEST_DC_CUA_DRIVER` — absolute path to cua-driver (default: `~/.local/bin/cua-driver`)

**Pattern for vision-model agents:**
1. `desktop_som_capture({pid})` → get screenshot + structured elements with `element_index`
2. `desktop_click_element({pid, element_index: 7, button: "left", capture_after: true})` → click by ID, get fresh snapshot back
3. `desktop_evict_screenshots({history, keep_last_n: 5})` → trim token usage

### 2. Android (11 tools)
ADB-backed control of phones and emulators. Requires `adb` on `PATH`
and at least one connected device or running emulator.

| Tools | Purpose |
|-------|---------|
| `android_devices`, `android_screenshot`, `android_screen_size`, `android_current_activity` | Discovery + state |
| `android_tap`, `android_swipe`, `android_text`, `android_key`, `android_launch_app` | Input |
| `android_ui_dump`, `android_logcat` | Inspection |

All Android tools accept an optional `device` field for targeting a
specific device id (useful with multiple devices).

### 3. Diagnostics
- `backend_status` — report desktop, Android, and Codex backend
  availability. Call this **first** if a tool is failing — it usually
  tells you why (missing ADB, missing Python deps, missing Codex app, etc.).
- `codex_mcp_config` — return a ready-to-use Codex Computer Use MCP
  config when the supported binary is available.
- `permissions_check` — return human-readable notes on macOS / Android
  permissions the operator may need to grant.

### 4. Compatibility aliases
Older tool names from previous MCP variants are routed to their modern
equivalents automatically:
- `screenshot`, `mouse_move`, `mouse_click`, `keyboard`, `cursor_position`,
  `launch_app`, etc. → `desktop_*`
- `computer_use_screenshot`, `computer_use_mouse_*`, `computer_use_keyboard`
  → `desktop_*`

## Safety Guidance

The terminal, file-write, and Android tools are powerful. **Only expose
this MCP server to agents and clients you trust.** A few ground rules:

1. **Never call `desktop_terminal` or `desktop_run_script` with arguments
   you didn't author yourself.** Either of these can execute arbitrary code
   on the host machine.

2. **Prefer `desktop_keyboard_type` + `desktop_keyboard_press` over
   `desktop_terminal` when possible.** Most user-facing workflows don't
   need shell access.

3. **Always check `backend_status` before launching a long multi-tool
   workflow.** It surfaces missing deps (Python, ADB, screen-recording
   permission) before you waste 20 tool calls finding out the hard way.

4. **On macOS, the first time the agent calls `desktop_screenshot`, macOS
   will prompt the operator to grant Screen Recording permission.** Make
   sure a human is around for the first call.

5. **On macOS, the first time the agent calls any mouse or keyboard tool,
   macOS will prompt the operator to grant Accessibility permission.**
   Same caveat.

6. **For Android, prefer `android_screenshot` over guessing screen
   coordinates.** The screenshot returns a PNG; you can analyze it
   (vision model) and then tap deterministically.

## Worked Examples

### Move the mouse and click a button
```json
{ "tool": "desktop_mouse_move",   "args": { "x": 640, "y": 400 } }
{ "tool": "desktop_mouse_click",  "args": { "x": 640, "y": 400, "button": "left" } }
```

### Take a screenshot, find a button, click it
```json
{ "tool": "desktop_screenshot",   "args": {} }
{ "tool": "desktop_find_image",   "args": { "image_path": "/tmp/save-button.png", "confidence": 0.85 } }
{ "tool": "desktop_mouse_click",  "args": { "x": 950, "y": 720 } }
```

### Type into a focused field
```json
{ "tool": "desktop_keyboard_type", "args": { "text": "hello world", "interval": 0.02 } }
```

### Wait for a UI element, then click it
```json
{ "tool": "desktop_wait_for_image", "args": { "image_path": "/tmp/ok-button.png", "timeout": 10 } }
{ "tool": "desktop_mouse_click",    "args": { "x": 720, "y": 540 } }
```

### Switch Android apps
```json
{ "tool": "android_launch_app",  "args": { "package": "com.android.chrome" } }
{ "tool": "android_screenshot",  "args": {} }
{ "tool": "android_tap",         "args": { "x": 540, "y": 1200 } }
```

## Configuration Overrides

| Env var | Effect |
|---------|--------|
| `NEWEST_DC_RS_TOOL_PATH` | Absolute path to the RuneScape lookup helper. If unset, defaults to `~/Desktop/rs-agent-tools/mcp-launcher.py` then `~/rs-agent-tools/mcp-launcher.py`. |
| `DUCKETS_RS_TOOL_PATH` | Legacy alias for `NEWEST_DC_RS_TOOL_PATH`. Used by older DuckBot installs. |
| `PATH` | Standard. Must include `adb` (for Android), `python3` or `python`, and `node`. |

## Verifying Your Install

```bash
bash scripts/check.sh            # human-readable summary
bash scripts/check.sh --json     # JSON for CI / agents
node scripts/inspect.js --list   # list every registered tool
node scripts/inspect.js --server # boot the server in status mode
```

## See Also

- [`README.md`](../README.md) — project overview and Quick Start
- [`SKILL.md`](../SKILL.md) — OpenClaw skill manifest
- [`docs/superpowers/plans/2026-05-06-newest-desktop-control.md`](superpowers/plans/2026-05-06-newest-desktop-control.md) — original implementation plan
- [`docs/superpowers/specs/2026-05-06-newest-desktop-control-design.md`](superpowers/specs/2026-05-06-newest-desktop-control-design.md) — design rationale
- [`CHANGELOG.md`](../CHANGELOG.md) — release history
