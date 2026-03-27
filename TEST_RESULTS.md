# Desktop Control Skill — Test Results

Verified on macOS:
- Screen size detected
- Mouse move/click works
- Keyboard typing works
- Hotkeys work
- Scroll works
- Clipboard copy/paste works
- Screenshot works (Retina)
- Window listing works
- Pixel color works via screenshot fallback

Notes:
- Direct pyautogui.write is reliable on macOS.
- Instant mouse movement works more reliably than long smooth moves.
- `screencapture` fallback is required for screenshots/pixel sampling.
