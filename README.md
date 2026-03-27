# Desktop Control — Lobster Edition Skill

A hardened, macOS-friendly desktop automation skill for OpenClaw.

Built to be reliable in real-world macOS use: smooth enough for normal work, strict enough for agent automation, and easy to restore or package for others.

## What it does
- Move the mouse to exact coordinates
- Click, double-click, right-click, drag, and scroll
- Type text reliably into the active app
- Use hotkeys and special keys
- Capture screenshots and sample pixel colors
- Search for UI images with confidence + region controls
- Retry flaky actions with backoff
- Verify actions after they run
- Open apps and run AppleScript on macOS
- List windows and detect the active window
- Copy/paste via clipboard
- Save/resume workflow state and task files
- Annotate screenshots and compare before/after images
- Run JSON task definitions with checkpoints, actions, and branching
- Preview and validate tasks before running them
- Record and replay macros
- Use policy rules for approval gating
- Support higher-level AI desktop workflows
- Provide checkpoint, queue, and audit-friendly controls

## What’s included
- `skill/` — the skill source code and docs
- `requirements.txt` — Python dependencies
- `TEST_RESULTS.md` — verification notes
- `IMPORT_NOTES.md` — restore/install instructions
- `CHANGELOG.md` — what was hardened and fixed
- `MANIFEST.md` — package contents and verification summary

## Verified on macOS
- Screen size detection: working
- Mouse move/click: working
- Keyboard typing: working
- Clipboard: working
- Screenshot: working (Retina / screencapture fallback)
- Pixel color sampling: working via screenshot fallback
- Active window detection: working via AppleScript fallback
- Window list: working

## Install
```bash
pip3 install --break-system-packages -r requirements.txt
```

## Quick test
```bash
cd skill
python3 -c "import sys; sys.path.insert(0, '.'); from __init__ import DesktopController; dc = DesktopController(failsafe=True); print(dc.get_screen_size())"
```

## Example usage
```python
import sys
sys.path.insert(0, 'skill')
from __init__ import DesktopController

ctrl = DesktopController(failsafe=True)
ctrl.move_mouse(500, 300)
ctrl.click()
ctrl.type_text('hello from desktop-control', paste=False)
ctrl.type_text('longer text here', paste=True)
img = ctrl.screenshot()
img.save('screen.png')
print(ctrl.get_pixel_color(10, 10))
```

## Notes
- Instant mouse moves are the most reliable default on macOS.
- `type_text(..., paste=True)` is useful for longer or more reliable input.
- `activate_window()` and `get_active_window()` use macOS AppleScript fallbacks first.
- `get_pixel_color()` uses screenshot sampling for reliability.
- The skill is intended for local automation; macOS Accessibility permissions may be required.

## Advanced helpers
- `find_on_screen_retry()` for confidence-based image search with fallback retries
- `click_image()` for image-based clicking
- `wait_for_image()` for UI readiness checks
- `verify_action()` for post-action validation
- `run_workflow()` for chaining desktop steps
- `browser_navigate()`, `open_app()`, `run_applescript()`, and `run_command()` for simple browser/terminal/macOS automation
- `checkpoint()`, `approval_gate()`, `run_queue()`, `capture_evidence()`, and `export_action_log()` for CoWork-style workflows
- `save_state()`, `load_state()`, `resume_workflow()`, `save_task()`, `load_task()`, `run_task()`, `preview_task()`, `validate_task()`, `workflow_report()`, `start_macro_recording()`, `stop_macro_recording()`, `save_macro()`, `load_macro()`, `replay_macro()`, `set_policy()`, `should_require_approval()`, `annotate_screenshot()`, `compare_screenshots()`, `diff_report()`, and `get_monitor_info()` / `select_monitor()` for durable workflows

## Credits
- **Original skill source:** ClawHub `matagul/desktop-control` (https://clawhub.ai/matagul/desktop-control)
- **Original concept and base implementation:** ClawHub skill by matagul
- **This edition:** Hardened, macOS-tested, and packaged for OpenClaw use

## Links
- GitHub repo: https://github.com/Franzferdinan51/desktop-control-lobster-edition-skill
- Desktop backup folder: `/Users/duckets/Desktop/desktop-control-backup`
