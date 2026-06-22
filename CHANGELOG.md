# Changelog

All notable changes to **newest-desktop-control** are documented here. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **CUA (Computer-Use Agent) backend** wrapping [trycua/cua-driver](https://github.com/trycua/cua).
  Hermes Agent proved this is the right architecture: instead of moving the user's
  real cursor, dispatch input via platform accessibility APIs (AX on macOS, UIA on
  Windows, AT-SPI2 on Linux). User keeps their cursor, keyboard focus, and screen
  state; agent runs alongside.
  - **Install:** `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"` — installs `~/.local/bin/cua-driver` + `/Applications/CuaDriver.app`. Grant Accessibility + Screen Recording to CuaDriver on first run.
  - **Env override:** `NEWEST_DC_CUA_DRIVER=/path/to/cua-driver`
- **12 new CUA tools** (wired through `src/backends/cua.js`):
  - `desktop_ax_tree` — structured accessibility tree (apps + per-window elements with `element_index` handles). Background-mode safe.
  - `desktop_list_apps` — list running + installed macOS apps with state flags.
  - `desktop_focus_app` — route input to a background app without stealing focus.
  - `desktop_launch_app_cua` — launch an app in the background (CUA variant).
  - `desktop_som_capture` — screenshot + SOM-labeled AX tree in one call.
  - `desktop_click_element` — click by `element_index` (preferred, works on backgrounded windows) or pixel.
  - `desktop_drag_element` — drag by element indices or pixel coords.
  - `desktop_type_into` — type text into a focused element by index or pid.
  - `desktop_key_combo` — press a hotkey combination (`cmd+shift+p`, etc).
  - `desktop_kill_app` — guarded `kill_app`. Refuses `pid=1`, kernel_task, WindowServer, loginwindow, launchd, and any `pid<50`. Hard-blocked, not overridable by env.
  - `desktop_screenshot_prompt_guard` — OCR + prompt-injection scan on text or screenshot.
  - `desktop_evict_screenshots` — token-aware eviction (keep last N, summarize older).
- **`scripts/cua_action.py`** — thin Python shim over `cua-driver call <tool> '<json>'`.
  15 actions (screenshot, ax_tree, list_apps, focus_app, som_capture, click_element,
  drag_element, type_into, key_combo, etc). Auto-resolves `window_id` from `list_windows`.
- **`src/backends/cua.js`** — JS backend module. Exports `createCuaBackend()`,
  `getDefaultCuaDriverPaths()`, `resolveCuaDriverPath()`, `killAppProtectionReason()`,
  `evictOldScreenshots()`, `scanForPromptInjection()`, `HARD_BLOCKED_ACTIONS`.
- **`capture_after: true`** flag on `desktop_click_element` — automatically re-snap
  the SOM tree after the click and return the first 20 elements + title for verification.
- **Hard-block destructive actions** at the tool layer (`killAppProtectionReason`):
  pid=1, reserved system pids (<50), invalid pids (NaN, negative, zero, non-numeric).
- **Prompt-injection guard** (`scanForPromptInjection`) — catches 7 common attack
  patterns: "ignore previous instructions", "you are now", "system:" lines,
  "disregard everything above", "new instructions:", chat template tokens
  (`<|im_start|>`), and "click immediately" urgency injection.
- **60 CUA tests** in `test/cua.test.js` covering: path resolution, status,
  hard-block guards, token-aware eviction, prompt injection, live `cua-driver`
  integration (auto-skipped if `cua-driver` missing), registry wiring, alias
  routing (launch_app still routes to desktop backend, not CUA), schema sanity.
- **`backend_status`** now includes a `cua` block with `cua_driver_path` and
  working/screen_size detail.
- **`permissions_check`** mentions CuaDriver.app entitlements for macOS.

### Changed
- `desktop_launch_app` keeps the desktop (pyautogui) behavior. Use
  `desktop_launch_app_cua` for the CUA variant. Aliases `launch_app` and
  `computer_use_launch_app` still route to `desktop_launch_app` (desktop backend).
- `backend_status` now reports 4 backends (desktop, cua, android, codex) + a top-level
  `cua_driver_path`.

## [0.2.0] — 2026-06-22

### Added
- **7 new desktop tool handlers** (wired through `src/backends/desktop.js` and
  `src/tools.js`):
  - `desktop_mouse_hover` — move-and-hold the cursor at `(x, y)` to trigger
    hover UI states.
  - `desktop_mouse_right_click` — right-click at a coordinate (or current
    cursor position).
  - `desktop_mouse_middle_click` — middle-click at a coordinate.
  - `desktop_focus_window` — cross-platform fallback that brings a window
    with the given title to the foreground.
  - `desktop_screenshot_window` — capture a screenshot of a specific
    window by title (returns PNG).
  - `desktop_get_window_info` — return position, size, and state info for a
    window by title.
  - `desktop_wait_for_image` — poll the screen until an image template
    appears, with timeout and confidence controls.
- **`scripts/check.sh`** — pre-flight health check. Verifies Node, Python,
  pip, the Python deps from `requirements.txt`, ADB, server boot, and
  the test suite. Supports `--json`, `--no-tests`, and `--quiet` flags.
  Returns distinct exit codes for required vs optional failures (handy for
  CI).
- **`scripts/inspect.js`** — interactive REPL for calling MCP tools and
  inspecting their responses. Useful for debugging and for trying out a
  tool before wiring it into an agent. Supports one-shot calls, tool
  listing, and a `--server` flag that boots the MCP server in status mode.
- **6 new npm scripts** — `setup`, `setup:openclaw`, `setup:hermes`,
  `setup:codex`, `setup:claude-desktop`, `setup:all`, `verify`, `check`,
  `inspect`.
- **`docs/AGENTS.md`** — integration guide for AI agents that consume this
  server. Includes tool groupings, safety guidance, and worked examples.
- **3 new tests** — covering the 7 new tool handlers, the `--path`
  override in `setup-config.js`, and tool-list advertisement.

### Changed
- **`desktop_rs_lookup`** is now env-overridable. The hardcoded
  `'/Users/duckets/Desktop/rs-agent-tools/...'` path is gone. The new
  resolution order is `NEWEST_DC_RS_TOOL_PATH` → `DUCKETS_RS_TOOL_PATH` →
  `~/Desktop/rs-agent-tools/...` → `~/rs-agent-tools/...` → friendly error
  message.
- **README.md** now leads with a "Quick Install" section that covers
  every supported agent framework.

## [1.0.0] — 2026-05-06

### Added
- Initial release of the consolidated Node.js MCP gateway.
- 40+ tools across desktop, Android, and Codex Computer Use backends.
- Cross-platform support for macOS, Linux, and Windows.
- Compatibility aliases for the older `screenshot`, `mouse_click`,
  `keyboard`, and `computer_use_*` tool names.
- 18-test test suite covering MCP initialization, tool registration,
  alias routing, Android command construction, Android parsers, and Codex
  config generation.
- `requirements.txt` and updated `SKILL.md` Python-dep declarations.
- Fix for 11 missing tool handlers, duplicate code blocks, and the
  `SKILL.md` path.
