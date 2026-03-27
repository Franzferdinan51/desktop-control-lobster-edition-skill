# Desktop Control Backup Manifest

Generated: 2026-03-27

## Included
- skill/
- README.md
- TEST_RESULTS.md
- IMPORT_NOTES.md
- CHANGELOG.md
- requirements.txt

## Verified Features
- Screen size detection
- Mouse move/click
- Keyboard typing
- Clipboard operations
- Screenshot capture
- Pixel color via screenshot fallback
- Active window via AppleScript fallback
- Window listing

## Notes
- `type_text(..., paste=True)` added for long text
- `move_mouse` defaults to instant movement for reliability
- macOS fallback paths were added for active window / activation / pixel / screenshot
