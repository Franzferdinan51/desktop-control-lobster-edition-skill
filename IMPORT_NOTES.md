# Desktop Control — Restore / Import Notes

## Restore Steps
1. Copy the `skill/` directory into your OpenClaw workspace (or wherever you keep skills).
2. Install Python dependencies:
   ```bash
   pip3 install --break-system-packages -r requirements.txt
   ```
3. Grant macOS Accessibility permissions if needed:
   - System Settings → Privacy & Security → Accessibility
4. Run the quick check:
   ```bash
   cd skill
   python3 -c "import sys; sys.path.insert(0, '.'); from __init__ import DesktopController; dc = DesktopController(failsafe=True); print(dc.get_screen_size())"
   ```

## Notes
- This skill is tuned for macOS reliability.
- For long text, prefer `type_text(..., paste=True)`.
- For window operations, AppleScript fallback is used first on macOS.
- For screenshots/pixel sampling, macOS `screencapture` fallback is used.

## If Something Fails
- Re-run the dependency install.
- Verify Accessibility permissions.
- Make sure the terminal/app you want to control is focused.
- If mouse movement feels flaky, use instant moves (no duration).
