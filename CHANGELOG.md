# Changelog

All notable changes to **newest-desktop-control** are documented here. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
