# Import Notes

To restore:
1. Copy `skill/` into your OpenClaw workspace under `skills/desktop-control`
2. Install dependencies:
   `pip3 install --break-system-packages -r requirements.txt`
3. Ensure Accessibility permissions are granted on macOS.
4. Run the quick test:
   `python3 -c "import sys; sys.path.insert(0, 'skill'); from __init__ import DesktopController; print(DesktopController().get_screen_size())"`
