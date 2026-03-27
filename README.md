# Desktop Control Backup

This folder contains the desktop-control skill and notes needed to restore or upload it to GitHub later.

## Contents
- `skill/` — the actual skill code and docs
- `requirements.txt` — Python dependencies
- `TEST_RESULTS.md` — quick verification notes
- `IMPORT_NOTES.md` — how to import/use the skill
- `CHANGELOG.md` — what changed in this hardened backup

## Status
- Mouse movement: working (instant default)
- Clicks: working
- Keyboard typing: working
- Screenshot: working
- Clipboard: working
- Window listing: working
- `activate_window` / `get_active_window`: patched for macOS fallback
- `pixel()` now uses screenshot fallback for macOS reliability
