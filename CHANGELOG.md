# Desktop Control Changelog

## 2026-03-27

### Reliability and workflow upgrades
- `move_mouse()` remains instant-first and safe for macOS.
- `type_text()` supports paste mode and now handles missing `pyperclip` more cleanly.
- `find_on_screen_retry()` and `click_image()` added for image-based automation.
- `wait_for_image()` and `verify_action()` added for verification loops.
- `run_workflow()` and `run_queue()` added for structured execution.
- `checkpoint()` and `prompt_checkpoint()` added for approval-style pauses.
- `save_state()` / `load_state()` added for workflow state persistence.
- `save_task()` / `load_task()` added for file-based task definitions.
- `capture_evidence()` and `annotate_screenshot()` added for evidence workflows.
- `compare_screenshots()` added for before/after review.
- `open_app()`, `run_applescript()`, `browser_navigate()`, and `run_command()` added for macOS/browser/terminal helpers.
- `get_pixel_color()` now guards out-of-bounds coordinates.
- `activate_window()` uses tighter macOS app-name matching.
- `run_command()` now supports approval checks and action logging.

### Notes
- The skill was tested on macOS with keyboard, mouse, screenshot, clipboard, state, and workflow helpers.
- CoWork-style audit and checkpoint features are now present in a practical first version.
