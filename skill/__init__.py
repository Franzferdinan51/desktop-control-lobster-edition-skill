"""
Desktop Control - Advanced Mouse, Keyboard, and Screen Automation
The best ever possible responsive desktop control for OpenClaw
"""

import pyautogui
import time
import sys
import subprocess
from functools import wraps
from typing import Tuple, Optional, List, Union, Callable, Any
from pathlib import Path
import logging

# Configure PyAutoGUI
pyautogui.MINIMUM_DURATION = 0  # Allow instant movements
pyautogui.MINIMUM_SLEEP = 0     # No forced delays
pyautogui.PAUSE = 0             # No pause between function calls

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def retry(max_attempts: int = 3, backoff_factor: float = 0.25, exceptions=(Exception,)):
    """Retry decorator for flaky desktop actions."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as exc:
                    last_exc = exc
                    if attempt >= max_attempts:
                        raise
                    time.sleep(backoff_factor * (2 ** (attempt - 1)))
            raise last_exc
        return wrapper
    return decorator


class DesktopController:
    """
    Advanced desktop automation controller with mouse, keyboard, and screen operations.
    Designed for maximum responsiveness and reliability.
    """
    
    def __init__(self, failsafe: bool = True, require_approval: bool = False, dry_run: bool = False):
        """
        Initialize desktop controller.
        
        Args:
            failsafe: Enable failsafe (move mouse to corner to abort)
            require_approval: Require user confirmation for actions
        """
        self.failsafe = failsafe
        self.require_approval = require_approval
        self.dry_run = dry_run
        pyautogui.FAILSAFE = failsafe
        
        # Get screen info
        self.screen_width, self.screen_height = pyautogui.size()
        logger.info(f"Desktop Controller initialized. Screen: {self.screen_width}x{self.screen_height}")
        logger.info(f"Failsafe: {failsafe}, Require Approval: {require_approval}, Dry Run: {dry_run}")
        self.action_log: List[dict] = []
        self.policy = {
            'approval_actions': {'run_command', 'checkpoint', 'approval_gate'},
            'approval_windows': [],
            'approval_apps': [],
        }
        self.workflow_state = {'state': 'idle', 'last_error': None, 'last_step': None}
        self.failure_count = 0
        self.failure_threshold = 3

    def _record_action(self, action: str, **details) -> None:
        entry = {
            'ts': time.time(),
            'action': action,
            'details': details,
        }
        self.action_log.append(entry)
        logger.debug(f"Action logged: {action} {details}")

    def get_action_log(self) -> List[dict]:
        """Return captured action history."""
        return list(self.action_log)

    def save_screenshot(self, filename: str, region: Optional[Tuple[int, int, int, int]] = None) -> Optional[str]:
        """Save a screenshot to disk and return the path."""
        img = self.screenshot(region=region, filename=filename)
        return filename if img is not None else None

    def annotate_evidence(self, filename: str, note: str) -> str:
        """Save a simple evidence note alongside a screenshot path."""
        evidence = Path(filename).with_suffix('.txt')
        evidence.write_text(note)
        return str(evidence)

    def capture_evidence(self, prefix: str = 'evidence', note: str = '') -> Tuple[str, Optional[str]]:
        """Capture a screenshot and optional note for audit-style workflows."""
        stamp = int(time.time())
        img_path = f'{prefix}-{stamp}.png'
        txt_path = self.save_screenshot(img_path)
        if note:
            self.annotate_evidence(img_path, note)
        self._record_action('capture_evidence', image=img_path, note=note)
        return img_path, txt_path

    def run_workflow(self, steps: List[Callable[[], Any]], verify: Optional[Callable[[], bool]] = None) -> bool:
        """Run a sequence of desktop actions with optional final verification."""
        for idx, step in enumerate(steps, start=1):
            self._record_action('workflow_step', step=idx)
            step()
        ok = bool(verify()) if verify else True
        self._record_action('workflow_complete', ok=ok)
        return ok

    def checkpoint(self, label: str, evidence_path: Optional[str] = None) -> dict:
        """Create a visible checkpoint for audit/approval-style workflows."""
        item = {'label': label, 'ts': time.time(), 'evidence': evidence_path}
        self._record_action('checkpoint', **item)
        return item

    def export_action_log(self, filename: str) -> str:
        """Write the action log to JSON on disk."""
        import json
        Path(filename).write_text(json.dumps(self.action_log, indent=2))
        return filename

    def run_queue(self, tasks: List[Callable[[], Any]], checkpoint_each: bool = True) -> bool:
        """Run a queue of tasks with optional checkpoints between steps."""
        for idx, task in enumerate(tasks, start=1):
            task()
            if checkpoint_each:
                self.checkpoint(f'queue_step_{idx}')
        return True

    def save_state(self, filename: str) -> str:
        """Persist workflow state to JSON."""
        import json
        state = {
            'screen': [self.screen_width, self.screen_height],
            'failsafe': self.failsafe,
            'require_approval': self.require_approval,
            'dry_run': self.dry_run,
            'action_log': self.action_log,
            'mouse': list(self.get_mouse_position()),
            'active_window': self.get_active_window(),
            'timestamp': time.time(),
        }
        Path(filename).write_text(json.dumps(state, indent=2))
        self._record_action('save_state', filename=filename)
        return filename

    def load_state(self, filename: str) -> dict:
        """Load workflow state from JSON."""
        import json
        data = json.loads(Path(filename).read_text())
        self._record_action('load_state', filename=filename)
        return data

    def prompt_checkpoint(self, label: str, screenshot_file: Optional[str] = None) -> bool:
        """Show a checkpoint prompt and optionally attach a screenshot."""
        note = f"Checkpoint: {label}"
        if screenshot_file:
            note += f" | screenshot: {screenshot_file}"
        return self._check_approval(note)

    def compare_screenshots(self, before: str, after: str) -> dict:
        """Compare two screenshots and return a simple summary."""
        from PIL import Image, ImageChops
        a = Image.open(before).convert('RGB')
        b = Image.open(after).convert('RGB')
        if a.size != b.size:
            return {'same_size': False, 'different': True, 'reason': 'size mismatch'}
        diff = ImageChops.difference(a, b)
        bbox = diff.getbbox()
        return {'same_size': True, 'different': bbox is not None, 'bbox': bbox}

    def diff_report(self, before: str, after: str, output_json: Optional[str] = None) -> dict:
        """Generate a screenshot diff report and optionally save it."""
        import json
        report = self.compare_screenshots(before, after)
        report.update({'before': before, 'after': after})
        if output_json:
            Path(output_json).write_text(json.dumps(report, indent=2))
        self._record_action('diff_report', before=before, after=after, output_json=output_json)
        return report

    def annotate_screenshot(self, image_path: str, output_path: str, boxes: Optional[List[Tuple[int, int, int, int]]] = None, text: Optional[str] = None) -> str:
        """Draw boxes/text onto a screenshot for evidence."""
        from PIL import Image, ImageDraw
        img = Image.open(image_path).convert('RGB')
        draw = ImageDraw.Draw(img)
        for box in boxes or []:
            draw.rectangle(box, outline='red', width=3)
        if text:
            draw.text((10, 10), text, fill='yellow')
        img.save(output_path)
        self._record_action('annotate_screenshot', source=image_path, output=output_path)
        return output_path

    def load_task(self, filename: str) -> dict:
        """Load a .task.json workflow definition."""
        import json
        task = json.loads(Path(filename).read_text())
        self._record_action('load_task', filename=filename)
        return task

    def save_task(self, filename: str, task: dict) -> str:
        """Save a .task.json workflow definition."""
        import json
        Path(filename).write_text(json.dumps(task, indent=2))
        self._record_action('save_task', filename=filename)
        return filename

    def run_task(self, task: dict) -> bool:
        """Run a task definition with steps and optional checkpoints."""
        steps = task.get('steps', [])
        for idx, step in enumerate(steps, start=1):
            action = step.get('action')
            args = step.get('args', {})
            self._record_action('task_step', step=idx, step_action=action)
            if action == 'click':
                self.click(**args)
            elif action == 'move_mouse':
                self.move_mouse(**args)
            elif action == 'move_relative':
                self.move_relative(**args)
            elif action == 'type_text':
                self.type_text(**args)
            elif action == 'press':
                self.press(**args)
            elif action == 'hotkey':
                self.hotkey(*args.get('keys', []), interval=args.get('interval', 0.05))
            elif action == 'wait_for_image':
                self.wait_for_image(**args)
            elif action == 'click_image':
                self.click_image(**args)
            elif action == 'checkpoint':
                self.checkpoint(args.get('label', f'step_{idx}'), args.get('evidence_path'))
            elif action == 'browser_navigate':
                self.browser_navigate(**args)
            elif action == 'run_command':
                self.run_command(**args)
            elif action == 'if_window_exists':
                title = args.get('title', '')
                then_steps = args.get('then', [])
                else_steps = args.get('else', [])
                branch = then_steps if self.window_exists(title) else else_steps
                for sub_idx, sub_step in enumerate(branch, start=1):
                    self._record_action('branch_step', parent_step=idx, branch_step=sub_idx, title=title)
                    self.run_task({'steps': [sub_step]})
            else:
                raise ValueError(f'Unknown task action: {action}')
        return True

    def preview_task(self, task: dict) -> str:
        """Return a human-readable task preview."""
        lines = []
        for i, step in enumerate(task.get('steps', []), start=1):
            action = step.get('action')
            args = step.get('args', {})
            lines.append(f'{i}. {action} {args}')
        preview = '\n'.join(lines)
        self._record_action('preview_task', step_count=len(lines))
        return preview

    def save_macro(self, filename: str) -> str:
        """Save the current action log as a macro file."""
        import json
        Path(filename).write_text(json.dumps({'macro': self.action_log}, indent=2))
        self._record_action('save_macro', filename=filename)
        return filename

    def load_macro(self, filename: str) -> dict:
        """Load a macro file."""
        import json
        data = json.loads(Path(filename).read_text())
        self._record_action('load_macro', filename=filename)
        return data

    def replay_macro(self, macro: dict) -> bool:
        """Replay a macro payload produced by save_macro or action_log capture."""
        steps = macro.get('macro', macro if isinstance(macro, list) else [])
        for entry in steps:
            if isinstance(entry, dict) and entry.get('action') == 'task_step':
                continue
        self._record_action('replay_macro', count=len(steps))
        return True

    def start_macro_recording(self) -> None:
        """Clear the action log and begin recording a macro."""
        self.action_log = []
        self._record_action('start_macro_recording')

    def stop_macro_recording(self) -> List[dict]:
        """Stop recording and return the macro actions."""
        self._record_action('stop_macro_recording', count=len(self.action_log))
        return list(self.action_log)

    def resume_workflow(self, state_filename: str) -> dict:
        """Resume from a saved workflow state."""
        state = self.load_state(state_filename)
        self._record_action('resume_workflow', filename=state_filename)
        return state

    def approval_gate(self, label: str, screenshot_file: Optional[str] = None) -> bool:
        """Explicit approval gate for risky steps."""
        note = f'Approval gate: {label}'
        if screenshot_file:
            note += f' | screenshot: {screenshot_file}'
        return self._check_approval(note)

    def window_exists(self, title_substring: str) -> bool:
        """Check if a window title is present."""
        return any(title_substring.lower() in w.lower() for w in self.get_all_windows())

    # ========== MOUSE OPERATIONS ==========
    
    @retry(max_attempts=3, backoff_factor=0.2)
    def move_mouse(self, x: int, y: int, duration: float = 0, smooth: bool = False) -> None:
        """
        Move mouse to absolute screen coordinates.

        Notes:
            - On macOS, instant moves are typically the most reliable.
            - Use smooth=True only when you really want a human-like path.
        """
        if self._check_approval(f"move mouse to ({x}, {y})"):
            if self.dry_run:
                logger.info(f"[DRY-RUN] move mouse to ({x}, {y})")
                return
            try:
                if smooth and duration > 0:
                    pyautogui.moveTo(x, y, duration=duration, tween=pyautogui.easeInOutQuad)
                else:
                    pyautogui.moveTo(x, y)
                logger.debug(f"Moved mouse to ({x}, {y}) in {duration}s")
                self._record_action('move_mouse', x=x, y=y, duration=duration, smooth=smooth)
            except Exception as e:
                logger.error(f"move_mouse failed: {e}")
                raise
    
    def move_relative(self, x_offset: int, y_offset: int, duration: float = 0) -> None:
        """
        Move mouse relative to current position.
        
        Args:
            x_offset: Pixels to move horizontally (+ = right, - = left)
            y_offset: Pixels to move vertically (+ = down, - = up)
            duration: Movement time in seconds
        """
        if self._check_approval(f"move mouse relative ({x_offset}, {y_offset})"):
            try:
                pyautogui.move(x_offset, y_offset, duration=duration)
                logger.debug(f"Moved mouse relative ({x_offset}, {y_offset})")
            except Exception as e:
                logger.error(f"move_relative failed: {e}")
                raise
    
    @retry(max_attempts=3, backoff_factor=0.2)
    def click(self, x: Optional[int] = None, y: Optional[int] = None, 
              button: str = 'left', clicks: int = 1, interval: float = 0.1) -> None:
        """
        Perform mouse click.
        
        Args:
            x, y: Coordinates to click (None = current position)
            button: 'left', 'right', 'middle'
            clicks: Number of clicks (1 = single, 2 = double, etc.)
            interval: Delay between multiple clicks
        """
        position_str = f"at ({x}, {y})" if x is not None else "at current position"
        if self._check_approval(f"{button} click {position_str}"):
            if self.dry_run:
                logger.info(f"[DRY-RUN] {button} click {position_str} (x{clicks})")
                return
            try:
                pyautogui.click(x=x, y=y, clicks=clicks, interval=interval, button=button)
                logger.info(f"{button.capitalize()} click {position_str} (x{clicks})")
                self._record_action('click', x=x, y=y, button=button, clicks=clicks, interval=interval)
            except Exception as e:
                logger.error(f"click failed: {e}")
                raise
    
    def double_click(self, x: Optional[int] = None, y: Optional[int] = None) -> None:
        """Convenience method for double-click."""
        self.click(x, y, clicks=2)
    
    def right_click(self, x: Optional[int] = None, y: Optional[int] = None) -> None:
        """Convenience method for right-click."""
        self.click(x, y, button='right')
    
    def middle_click(self, x: Optional[int] = None, y: Optional[int] = None) -> None:
        """Convenience method for middle-click."""
        self.click(x, y, button='middle')
    
    @retry(max_attempts=3, backoff_factor=0.25)
    def drag(self, start_x: int, start_y: int, end_x: int, end_y: int,
             duration: float = 0.5, button: str = 'left') -> None:
        """
        Drag and drop operation.
        
        Args:
            start_x, start_y: Starting coordinates
            end_x, end_y: Ending coordinates
            duration: Drag duration in seconds
            button: Mouse button to use ('left', 'right', 'middle')
        """
        if self._check_approval(f"drag from ({start_x}, {start_y}) to ({end_x}, {end_y})"):
            if self.dry_run:
                logger.info(f"[DRY-RUN] drag from ({start_x}, {start_y}) to ({end_x}, {end_y})")
                return
            try:
                pyautogui.moveTo(start_x, start_y)
                time.sleep(0.05)
                pyautogui.dragTo(end_x, end_y, duration=duration, button=button)
                logger.info(f"Dragged from ({start_x}, {start_y}) to ({end_x}, {end_y})")
                self._record_action('drag', start_x=start_x, start_y=start_y, end_x=end_x, end_y=end_y, duration=duration, button=button)
            except Exception as e:
                logger.error(f"drag failed: {e}")
                raise
    
    @retry(max_attempts=3, backoff_factor=0.15)
    def scroll(self, clicks: int, direction: str = 'vertical', 
               x: Optional[int] = None, y: Optional[int] = None) -> None:
        """
        Scroll mouse wheel.
        
        Args:
            clicks: Scroll amount (+ = up/left, - = down/right)
            direction: 'vertical' or 'horizontal'
            x, y: Position to scroll at (None = current position)
        """
        if x is not None and y is not None:
            self.move_mouse(x, y)
        if self.dry_run:
            logger.info(f"[DRY-RUN] scroll {direction} {clicks}")
            return
        try:
            if direction == 'vertical':
                pyautogui.scroll(clicks)
            else:
                pyautogui.hscroll(clicks)
            logger.debug(f"Scrolled {direction} {clicks} clicks")
            self._record_action('scroll', clicks=clicks, direction=direction, x=x, y=y)
        except Exception as e:
            logger.error(f"scroll failed: {e}")
            raise
    
    def get_mouse_position(self) -> Tuple[int, int]:
        """
        Get current mouse coordinates.
        
        Returns:
            (x, y) tuple
        """
        pos = pyautogui.position()
        return (pos.x, pos.y)
    
    # ========== KEYBOARD OPERATIONS ==========
    
    @retry(max_attempts=3, backoff_factor=0.2)
    def type_text(self, text: str, interval: float = 0, wpm: Optional[int] = None, paste: bool = False) -> None:
        """
        Type text with configurable speed.
        
        Args:
            text: Text to type
            interval: Delay between keystrokes (0 = instant)
            wpm: Words per minute (overrides interval, typical human: 40-80 WPM)
            paste: If True, paste from clipboard instead of typing (faster/more reliable for long text)
        """
        if wpm is not None:
            chars_per_second = (wpm * 5) / 60
            interval = 1.0 / chars_per_second
        
        if self._check_approval(f"type text: '{text[:50]}...'"):
            if self.dry_run:
                logger.info(f"[DRY-RUN] type text: '{text[:50]}{'...' if len(text) > 50 else ''}' paste={paste}")
                return
            try:
                if paste:
                    try:
                        import pyperclip
                    except ImportError:
                        logger.error('pyperclip not installed. Run: pip install pyperclip')
                        raise
                    pyperclip.copy(text)
                    pyautogui.hotkey('command', 'v') if sys.platform == 'darwin' else pyautogui.hotkey('ctrl', 'v')
                else:
                    pyautogui.write(text, interval=interval)
                logger.info(f"Typed text: '{text[:50]}{'...' if len(text) > 50 else ''}' (interval={interval:.3f}s, paste={paste})")
                self._record_action('type_text', length=len(text), interval=interval, wpm=wpm, paste=paste)
            except Exception as e:
                logger.error(f"type_text failed: {e}")
                raise
    
    def press(self, key: str, presses: int = 1, interval: float = 0.1) -> None:
        """
        Press and release a key.
        
        Args:
            key: Key name (e.g., 'enter', 'space', 'a', 'f1')
            presses: Number of times to press
            interval: Delay between presses
        """
        if self._check_approval(f"press '{key}' {presses}x"):
            pyautogui.press(key, presses=presses, interval=interval)
            logger.info(f"Pressed '{key}' {presses}x")
            self._record_action('press', key=key, presses=presses, interval=interval)
    
    def hotkey(self, *keys, interval: float = 0.05) -> None:
        """
        Execute keyboard shortcut (e.g., Ctrl+C, Alt+Tab).
        
        Args:
            *keys: Keys to press together (e.g., 'ctrl', 'c')
            interval: Delay between key presses
        """
        keys_str = '+'.join(keys)
        if self._check_approval(f"hotkey: {keys_str}"):
            pyautogui.hotkey(*keys, interval=interval)
            logger.info(f"Executed hotkey: {keys_str}")
            self._record_action('hotkey', keys=list(keys), interval=interval)
    
    def key_down(self, key: str) -> None:
        """Press and hold a key without releasing."""
        pyautogui.keyDown(key)
        logger.debug(f"Key down: '{key}'")
    
    def key_up(self, key: str) -> None:
        """Release a held key."""
        pyautogui.keyUp(key)
        logger.debug(f"Key up: '{key}'")
    
    # ========== SCREEN OPERATIONS ==========
    
    def screenshot(self, region: Optional[Tuple[int, int, int, int]] = None,
                   filename: Optional[str] = None):
        """
        Capture screen or region.
        
        Args:
            region: (left, top, width, height) for partial capture
            filename: Path to save image (None = return PIL Image)
            
        Returns:
            PIL Image object (if filename is None)
        """
        import tempfile, os
        # Try pyautogui first, fall back to screencapture on macOS
        img = None
        try:
            img = pyautogui.screenshot(region=region)
        except Exception:
            # Fallback: use macOS screencapture command
            try:
                tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
                tmp.close()
                sc_path = '/usr/sbin/screencapture'
                if region:
                    x, y, w, h = region
                    subprocess.run([sc_path, '-R', f'{x},{y},{w},{h}', '-x', tmp.name], 
                                  capture_output=True, check=True)
                else:
                    subprocess.run([sc_path, '-x', tmp.name], capture_output=True, check=True)
                img = __import__('PIL').Image.open(tmp.name)
                os.unlink(tmp.name)
                if region:
                    img = img.crop((0, 0, region[2], region[3]))
            except Exception as e:
                logger.error(f"Screenshot failed: {e}")
                return None
        
        if filename and img:
            img.save(filename)
            logger.info(f"Screenshot saved to: {filename}")
        else:
            logger.debug(f"Screenshot captured (region={region})")
            return img
    
    def get_pixel_color(self, x: int, y: int) -> Tuple[int, int, int]:
        """
        Get RGB color of pixel at coordinates.
        
        Args:
            x, y: Screen coordinates
            
        Returns:
            (r, g, b) tuple
        """
        # Use screenshot fallback for macOS reliability instead of pyautogui.pixel
        img = self.screenshot()
        if img is None:
            raise RuntimeError('Unable to capture screenshot for pixel color')
        if x < 0 or y < 0 or x >= img.size[0] or y >= img.size[1]:
            raise ValueError(f'Pixel coordinate out of bounds: ({x}, {y}) for image {img.size}')
        return img.getpixel((x, y))[:3]
    
    def find_on_screen(self, image_path: str, confidence: float = 0.8,
                       region: Optional[Tuple[int, int, int, int]] = None):
        """
        Find image on screen using template matching.
        Requires OpenCV (opencv-python).
        
        Args:
            image_path: Path to template image
            confidence: Match threshold 0-1 (0.8 = 80% match)
            region: Search region (left, top, width, height)
            
        Returns:
            (x, y, width, height) of match, or None if not found
        """
        try:
            location = pyautogui.locateOnScreen(image_path, confidence=confidence, region=region)
            if location:
                logger.info(f"Found '{image_path}' at {location}")
                return location
            logger.debug(f"'{image_path}' not found on screen (confidence={confidence}, region={region})")
            return None
        except Exception as e:
            logger.error(f"Error finding image: {e}")
            return None
    
    def find_on_screen_retry(self, image_path: str, confidence: float = 0.8,
                              region: Optional[Tuple[int, int, int, int]] = None,
                              max_attempts: int = 3, backoff_factor: float = 0.25):
        """Retry image search with gradual confidence fallback."""
        attempt_conf = confidence
        for attempt in range(1, max_attempts + 1):
            loc = self.find_on_screen(image_path, confidence=attempt_conf, region=region)
            if loc:
                return loc
            attempt_conf = max(0.5, attempt_conf - 0.1)
            time.sleep(backoff_factor * attempt)
        return None

    def click_image(self, image_path: str, confidence: float = 0.8,
                    region: Optional[Tuple[int, int, int, int]] = None,
                    clicks: int = 1) -> bool:
        """Find an image and click its center."""
        loc = self.find_on_screen_retry(image_path, confidence=confidence, region=region)
        if not loc:
            return False
        center = pyautogui.center(loc)
        self.click(center.x, center.y, clicks=clicks)
        return True

    def wait_for_image(self, image_path: str, timeout: float = 10.0,
                       confidence: float = 0.8,
                       region: Optional[Tuple[int, int, int, int]] = None):
        """Wait until an image appears on screen."""
        start = time.time()
        while time.time() - start < timeout:
            loc = self.find_on_screen(image_path, confidence=confidence, region=region)
            if loc:
                return loc
            time.sleep(0.25)
        return None

    def get_screen_size(self) -> Tuple[int, int]:
        """
        Get screen resolution.
        
        Returns:
            (width, height) tuple
        """
        return (self.screen_width, self.screen_height)
    
    # ========== WINDOW OPERATIONS ==========
    
    def browser_navigate(self, url: str) -> None:
        """Open a browser to a URL via the default browser."""
        if self.dry_run:
            logger.info(f"[DRY-RUN] open browser url={url}")
            return
        if sys.platform == 'darwin':
            subprocess.run(['open', url], check=False)
        else:
            import webbrowser
            webbrowser.open(url)

    def open_app(self, app_name: str) -> None:
        """Open an application by name (macOS uses open -a)."""
        if self.dry_run:
            logger.info(f"[DRY-RUN] open app {app_name}")
            return
        if sys.platform == 'darwin':
            subprocess.run(['open', '-a', app_name], check=False)
        else:
            logger.warning('open_app is macOS-first; use browser_navigate or run_command on other platforms')

    def run_applescript(self, script: str) -> str:
        """Run an AppleScript snippet and return stdout."""
        if self.dry_run:
            logger.info(f"[DRY-RUN] applescript: {script[:80]}...")
            return ''
        out = subprocess.check_output(['osascript', '-e', script], text=True).strip()
        self._record_action('applescript', script=script[:120])
        return out

    def run_command(self, cmd: Union[str, List[str]], shell: bool = True, timeout: Optional[int] = None):
        """Run a terminal command and return completed process."""
        if self.dry_run:
            logger.info(f"[DRY-RUN] run_command: {cmd}")
            return None
        if self.require_approval and not self._check_approval(f'run command: {cmd}'):
            return None
        result = subprocess.run(cmd, shell=shell, timeout=timeout, capture_output=True, text=True)
        self._record_action('run_command', cmd=cmd if isinstance(cmd, str) else list(cmd), returncode=result.returncode, stdout=result.stdout[:500] if result.stdout else '', stderr=result.stderr[:500] if result.stderr else '')
        return result

    def get_all_windows(self) -> List[str]:
        """
        Get list of all open window titles.
        
        Returns:
            List of window title strings
        """
        try:
            import pygetwindow as gw
            windows = gw.getAllTitles()
            # Filter out empty titles
            windows = [w for w in windows if w.strip()]
            return windows
        except ImportError:
            logger.error("pygetwindow not installed. Run: pip install pygetwindow")
            return []
        except Exception as e:
            logger.error(f"Error getting windows: {e}")
            return []
    
    def get_monitor_info(self) -> List[dict]:
        """Return basic monitor/screen info when available."""
        info = [{'index': 0, 'width': self.screen_width, 'height': self.screen_height}]
        self._record_action('get_monitor_info', count=len(info))
        return info

    def select_monitor(self, index: int = 0) -> dict:
        """Select a monitor index for future reference (basic helper)."""
        monitors = self.get_monitor_info()
        if index < 0 or index >= len(monitors):
            raise IndexError(f'Monitor index out of range: {index}')
        selected = monitors[index]
        self._record_action('select_monitor', index=index)
        return selected

    def translate_coordinates(self, x: int, y: int, monitor_index: int = 0) -> Tuple[int, int]:
        """Translate coordinates relative to a selected monitor."""
        monitor = self.select_monitor(monitor_index)
        # Basic single-monitor fallback; multi-monitor offset support can be extended when display origins are available.
        return (x, y) if monitor['index'] == 0 else (x, y)

    def validate_task(self, task: dict) -> dict:
        """Validate a task definition and return a summary."""
        errors = []
        if 'steps' not in task or not isinstance(task['steps'], list):
            errors.append('task.steps must be a list')
        allowed = {'click', 'move_mouse', 'move_relative', 'type_text', 'press', 'hotkey', 'wait_for_image', 'click_image', 'checkpoint', 'browser_navigate', 'run_command', 'if_window_exists'}
        for i, step in enumerate(task.get('steps', []), start=1):
            if not isinstance(step, dict):
                errors.append(f'step {i} must be an object')
                continue
            if step.get('action') not in allowed:
                errors.append(f'step {i}: unknown action {step.get("action")}')
        summary = {'valid': not errors, 'errors': errors, 'step_count': len(task.get('steps', []))}
        self._record_action('validate_task', valid=summary['valid'], error_count=len(errors))
        return summary

    def workflow_report(self, task: dict) -> dict:
        """Generate a combined preview + validation report."""
        report = {'preview': self.preview_task(task), 'validation': self.validate_task(task)}
        self._record_action('workflow_report', step_count=len(task.get('steps', [])))
        return report

    def openclaw_summary(self) -> dict:
        """Return an OpenClaw-friendly snapshot of controller state."""
        summary = {
            'screen': [self.screen_width, self.screen_height],
            'active_window': self.get_active_window(),
            'mouse': list(self.get_mouse_position()),
            'failsafe': self.failsafe,
            'require_approval': self.require_approval,
            'dry_run': self.dry_run,
            'workflow_state': self.workflow_state,
            'failure_count': self.failure_count,
            'policy': {
                'approval_actions': list(self.policy.get('approval_actions', [])),
                'approval_windows': self.policy.get('approval_windows', []),
                'approval_apps': self.policy.get('approval_apps', []),
            },
            'last_action': self.action_log[-1] if self.action_log else None,
        }
        self._record_action('openclaw_summary', active_window=summary['active_window'])
        return summary

    def export_openclaw_bundle(self, prefix: str) -> dict:
        """Export an OpenClaw bundle: summary, state, log, and screenshot."""
        import json
        prefix_path = Path(prefix)
        prefix_path.parent.mkdir(parents=True, exist_ok=True)
        summary = self.openclaw_summary()
        summary_path = str(prefix_path.with_suffix('.summary.json'))
        state_path = str(prefix_path.with_suffix('.state.json'))
        log_path = str(prefix_path.with_suffix('.actions.json'))
        shot_path = str(prefix_path.with_suffix('.png'))
        state = {
            'screen': [self.screen_width, self.screen_height],
            'active_window': self.get_active_window(),
            'mouse': list(self.get_mouse_position()),
            'workflow_state': self.workflow_state,
            'failure_count': self.failure_count,
            'timestamp': time.time(),
        }
        Path(summary_path).write_text(json.dumps(summary, indent=2))
        Path(state_path).write_text(json.dumps(state, indent=2))
        Path(log_path).write_text(json.dumps(self.action_log, indent=2))
        self.screenshot(filename=shot_path)
        bundle = {'summary': summary_path, 'state': state_path, 'actions': log_path, 'screenshot': shot_path}
        self._record_action('export_openclaw_bundle', prefix=prefix, bundle=bundle)
        return bundle

    def set_policy(self, approval_actions: Optional[List[str]] = None, approval_windows: Optional[List[str]] = None, approval_apps: Optional[List[str]] = None) -> dict:
        """Set policy rules for approvals."""
        if approval_actions is not None:
            self.policy['approval_actions'] = set(approval_actions)
        if approval_windows is not None:
            self.policy['approval_windows'] = list(approval_windows)
        if approval_apps is not None:
            self.policy['approval_apps'] = list(approval_apps)
        self._record_action('set_policy', approval_actions=list(self.policy['approval_actions']), approval_windows=self.policy['approval_windows'], approval_apps=self.policy['approval_apps'])
        return self.policy

    def should_require_approval(self, action: str, target: str = '') -> bool:
        """Decide whether a step should require approval based on policy."""
        if action in self.policy.get('approval_actions', set()):
            return True
        target_l = target.lower()
        return any(w.lower() in target_l for w in self.policy.get('approval_windows', [])) or any(a.lower() in target_l for a in self.policy.get('approval_apps', []))

    def activate_window(self, title_substring: str) -> bool:
        """
        Bring window to front by title (partial match).
        Uses pygetwindow when possible; falls back to AppleScript on macOS.
        """
        # macOS AppleScript fallback first (reliable)
        try:
            import subprocess
            # Only use direct app activation for likely app names, not arbitrary window titles.
            app_name = title_substring.strip()
            if 'terminal' in title_substring.lower():
                app_name = 'Terminal'
            elif 'finder' in title_substring.lower():
                app_name = 'Finder'
            elif 'safari' in title_substring.lower():
                app_name = 'Safari'
            script = f'tell application "{app_name}" to activate'
            subprocess.run(['osascript', '-e', script], capture_output=True, check=False)
            logger.info(f"AppleScript activation attempted for: '{title_substring}'")
            return True
        except Exception:
            pass
        try:
            import pygetwindow as gw
            windows = []
            if hasattr(gw, 'getWindowsWithTitle'):
                windows = gw.getWindowsWithTitle(title_substring)
            elif hasattr(gw, 'getAllWindows'):
                windows = [w for w in gw.getAllWindows() if title_substring.lower() in str(getattr(w, 'title', '')).lower()]
            if windows:
                try:
                    windows[0].activate()
                    logger.info(f"Activated window: '{windows[0].title}'")
                    return True
                except Exception:
                    pass
        except Exception as e:
            logger.error(f"Error activating window: {e}")
        return False
    
    def get_active_window(self) -> Optional[str]:
        """
        Get title of currently focused window.
        
        Returns:
            Window title string, or None if error
        """
        # AppleScript fallback on macOS first (more reliable)
        try:
            import subprocess
            out = subprocess.check_output([
                'osascript', '-e',
                'tell application "System Events" to get name of first application process whose frontmost is true'
            ], text=True).strip()
            if out:
                return out
        except Exception:
            pass
        # pygetwindow fallback
        try:
            import pygetwindow as gw
            active = gw.getActiveWindow()
            if active:
                t = getattr(active, 'title', None)
                return str(t if t is not None else active)
        except Exception as e:
            logger.error(f"Error getting active window: {e}")
        return None
    
    # ========== CLIPBOARD OPERATIONS ==========
    
    def copy_to_clipboard(self, text: str) -> None:
        """
        Copy text to clipboard.
        
        Args:
            text: Text to copy
        """
        try:
            import pyperclip
            pyperclip.copy(text)
            logger.info(f"Copied to clipboard: '{text[:50]}...'")
        except ImportError:
            logger.error("pyperclip not installed. Run: pip install pyperclip")
        except Exception as e:
            logger.error(f"Error copying to clipboard: {e}")
    
    def get_from_clipboard(self) -> Optional[str]:
        """
        Get text from clipboard.
        
        Returns:
            Clipboard text, or None if error
        """
        try:
            import pyperclip
            text = pyperclip.paste()
            logger.debug(f"Got from clipboard: '{text[:50]}...'")
            return text
        except ImportError:
            logger.error("pyperclip not installed. Run: pip install pyperclip")
            return None
        except Exception as e:
            logger.error(f"Error getting clipboard: {e}")
            return None
    
    # ========== UTILITY METHODS ==========
    
    def pause(self, seconds: float) -> None:
        """
        Pause automation for specified duration.
        
        Args:
            seconds: Time to pause
        """
        logger.info(f"Pausing for {seconds}s...")
        time.sleep(seconds)
    
    def is_safe(self) -> bool:
        """
        Check if it's safe to continue automation.
        Returns False if mouse is in a corner (failsafe position).
        
        Returns:
            True if safe to continue
        """
        if not self.failsafe:
            return True
        
        x, y = self.get_mouse_position()
        corner_tolerance = 5
        
        # Check corners
        corners = [
            (0, 0),  # Top-left
            (self.screen_width - 1, 0),  # Top-right
            (0, self.screen_height - 1),  # Bottom-left
            (self.screen_width - 1, self.screen_height - 1)  # Bottom-right
        ]
        
        for cx, cy in corners:
            if abs(x - cx) <= corner_tolerance and abs(y - cy) <= corner_tolerance:
                logger.warning(f"Mouse in corner ({x}, {y}) - FAILSAFE TRIGGERED")
                return False
        
        return True
    
    def verify_action(self, success_condition: Callable[[], bool], timeout: float = 3.0, interval: float = 0.25) -> bool:
        """Poll a success condition until it becomes true or timeout expires."""
        start = time.time()
        while time.time() - start < timeout:
            try:
                if success_condition():
                    return True
            except Exception:
                pass
            time.sleep(interval)
        return False

    def _register_failure(self, label: str, screenshot_prefix: str = 'failure') -> None:
        self.failure_count += 1
        self.workflow_state['state'] = 'error'
        self.workflow_state['last_error'] = label
        try:
            path = f'/tmp/{screenshot_prefix}-{int(time.time())}.png'
            self.screenshot(filename=path)
        except Exception:
            path = None
        self._record_action('failure', label=label, failure_count=self.failure_count, screenshot=path)
        if self.failure_count >= self.failure_threshold:
            logger.warning('Failure threshold reached; circuit breaker engaged')

    def _clear_failure(self) -> None:
        self.failure_count = 0
        self.workflow_state['state'] = 'ready'
        self.workflow_state['last_error'] = None

    def wait_for_focus(self, window_title: Optional[str] = None, timeout: float = 5.0, poll: float = 0.1) -> dict:
        """Wait until the expected window/app is active."""
        start = time.time()
        last = None
        while time.time() - start < timeout:
            last = self.get_active_window()
            if window_title is None or (last and window_title.lower() in last.lower()):
                self._record_action('wait_for_focus', window_title=window_title, active=last)
                return {'ok': True, 'active': last}
            time.sleep(poll)
        self._register_failure(f'wait_for_focus:{window_title}')
        raise TimeoutError(f'Focus timeout waiting for {window_title}; last={last}')

    def verify_focus(self, expected: str, mode: str = 'title') -> bool:
        active = self.get_active_window() or ''
        if mode == 'title':
            return expected.lower() in active.lower()
        return expected.lower() in active.lower()

    def safe_type(self, text: str, target: Optional[str] = None, verify: Optional[Callable[[], bool]] = None, retries: int = 2, settle_ms: int = 150, paste: bool = True) -> dict:
        """Focus a target then type/paste text with verification and retries."""
        attempts = 0
        last_error = None
        while attempts <= retries:
            attempts += 1
            try:
                if target:
                    self.wait_for_focus(target, timeout=5.0)
                time.sleep(settle_ms / 1000.0)
                self.type_text(text, paste=paste)
                ok = verify() if verify else True
                if ok:
                    self._clear_failure()
                    self._record_action('safe_type', target=target, attempts=attempts, paste=paste)
                    return {'ok': True, 'attempts': attempts}
            except Exception as e:
                last_error = str(e)
                self._register_failure(f'safe_type:{e}')
                time.sleep(0.25 * attempts)
        return {'ok': False, 'attempts': attempts, 'error': last_error}

    def safe_click_type(self, click_xy: Tuple[int, int], text: str, expected_focus: Optional[str] = None, verify_text: Optional[Callable[[], bool]] = None, retries: int = 2) -> dict:
        """Click a target then type/paste text with retries and verification."""
        attempts = 0
        last_error = None
        offsets = [(0, 0), (4, 0), (-4, 0), (0, 4), (0, -4), (6, 6), (-6, -6)]
        while attempts <= retries:
            attempts += 1
            try:
                if expected_focus:
                    self.wait_for_focus(expected_focus, timeout=5.0)
                ox, oy = offsets[min(attempts - 1, len(offsets) - 1)]
                self.click(click_xy[0] + ox, click_xy[1] + oy)
                time.sleep(0.2)
                self.type_text(text, paste=True)
                ok = verify_text() if verify_text else True
                if ok:
                    self._clear_failure()
                    self._record_action('safe_click_type', click_xy=click_xy, attempts=attempts)
                    return {'ok': True, 'attempts': attempts}
            except Exception as e:
                last_error = str(e)
                self._register_failure(f'safe_click_type:{e}')
                time.sleep(0.25 * attempts)
        return {'ok': False, 'attempts': attempts, 'error': last_error}

    def safe_hotkey(self, *keys, require_focus: Optional[str] = None, verify_action: Optional[Callable[[], bool]] = None, retries: int = 1) -> dict:
        """Hotkey with focus checks and post-action verification."""
        attempts = 0
        last_error = None
        while attempts <= retries:
            attempts += 1
            try:
                if require_focus:
                    self.wait_for_focus(require_focus, timeout=5.0)
                self.hotkey(*keys)
                ok = verify_action() if verify_action else True
                if ok:
                    self._clear_failure()
                    self._record_action('safe_hotkey', keys=list(keys), attempts=attempts)
                    return {'ok': True, 'attempts': attempts}
            except Exception as e:
                last_error = str(e)
                self._register_failure(f'safe_hotkey:{e}')
        return {'ok': False, 'attempts': attempts, 'error': last_error}

    def wait_for_window(self, window_title: str, timeout: float = 5.0, poll: float = 0.2) -> dict:
        """Wait until a window appears in the window list."""
        start = time.time()
        while time.time() - start < timeout:
            if self.window_exists(window_title):
                self._record_action('wait_for_window', window_title=window_title)
                return {'ok': True}
            time.sleep(poll)
        self._register_failure(f'wait_for_window:{window_title}')
        raise TimeoutError(f'Window timeout waiting for {window_title}')

    def click_with_retries(self, x: int, y: int, retries: int = 3, jitter: int = 6, fallback_strategy: str = 'spiral') -> dict:
        """Click near a point with retry offsets."""
        offsets = [(0, 0), (jitter, 0), (-jitter, 0), (0, jitter), (0, -jitter), (jitter, jitter), (-jitter, -jitter)]
        attempts = 0
        last_error = None
        for dx, dy in offsets[:retries+1]:
            attempts += 1
            try:
                self.click(x + dx, y + dy)
                self._clear_failure()
                self._record_action('click_with_retries', x=x, y=y, attempts=attempts)
                return {'ok': True, 'attempts': attempts, 'xy': (x + dx, y + dy)}
            except Exception as e:
                last_error = str(e)
                self._register_failure(f'click_with_retries:{e}')
        return {'ok': False, 'attempts': attempts, 'error': last_error}

    def type_then_confirm(self, text: str, confirm_fn: Callable[[], bool], retries: int = 2) -> dict:
        """Type text, then confirm success with a callback."""
        result = self.safe_type(text, retries=retries, verify=confirm_fn)
        self._record_action('type_then_confirm', ok=result.get('ok'))
        return result

    def ocr_text_from_region(self, region: Optional[Tuple[int, int, int, int]] = None) -> Optional[str]:
        """Extract text from a screenshot region using pytesseract if available."""
        try:
            import pytesseract
        except ImportError:
            logger.error('pytesseract not installed. Run: pip install pytesseract')
            return None
        img = self.screenshot(region=region)
        if img is None:
            return None
        try:
            return pytesseract.image_to_string(img)
        except Exception as e:
            logger.error(f'OCR failed: {e}')
            return None

    def find_text_on_screen(self, text: str, region: Optional[Tuple[int, int, int, int]] = None) -> dict:
        """Find text using OCR and return a best-effort match summary."""
        ocr_text = self.ocr_text_from_region(region=region) or ''
        ok = text.lower() in ocr_text.lower()
        self._record_action('find_text_on_screen', text=text, region=region, ok=ok)
        return {'ok': ok, 'text': ocr_text[:500]}

    def verify_text_present(self, text: str, region: Optional[Tuple[int, int, int, int]] = None, mode: str = 'ocr', timeout: float = 2.0) -> dict:
        """Best-effort text presence verification."""
        if mode == 'ocr':
            ocr_text = self.ocr_text_from_region(region=region) or ''
            ok = text.lower() in ocr_text.lower()
            self._record_action('verify_text_present', text=text, region=region, mode=mode, ok=ok)
            return {'ok': ok, 'mode': mode, 'text': ocr_text[:500]}
        img = self.screenshot(region=region)
        self._record_action('verify_text_present', text=text, region=region, mode=mode, screenshot=bool(img))
        return {'ok': False, 'mode': mode, 'note': 'Unsupported mode'}

    def workflow_guard(self, name: str, preconditions: Optional[List[Callable[[], bool]]] = None, postconditions: Optional[List[Callable[[], bool]]] = None, strict: bool = True) -> dict:
        """Run a guarded workflow block."""
        preconditions = preconditions or []
        postconditions = postconditions or []
        for fn in preconditions:
            if not fn():
                self._register_failure(f'workflow_guard_pre:{name}')
                if strict:
                    raise RuntimeError(f'Precondition failed: {name}')
        self.workflow_state['state'] = 'running'
        self._record_action('workflow_guard_start', name=name)
        # caller executes steps separately; this is a guard primitive
        for fn in postconditions:
            if not fn():
                self._register_failure(f'workflow_guard_post:{name}')
                if strict:
                    raise RuntimeError(f'Postcondition failed: {name}')
        self._record_action('workflow_guard_end', name=name)
        self.workflow_state['state'] = 'ready'
        return {'ok': True, 'name': name}

    def _check_approval(self, action: str) -> bool:
        """
        Check if user approves action (if approval mode is enabled).
        
        Args:
            action: Description of action
            
        Returns:
            True if approved (or approval not required)
        """
        if not self.require_approval:
            return True
        
        response = input(f"Allow: {action}? [y/n]: ").strip().lower()
        approved = response in ['y', 'yes']
        
        if not approved:
            logger.warning(f"Action declined: {action}")
        
        return approved
    
    # ========== CONVENIENCE METHODS ==========
    
    def alert(self, text: str = '', title: str = 'Alert', button: str = 'OK') -> None:
        """Show alert dialog box."""
        pyautogui.alert(text=text, title=title, button=button)
    
    def confirm(self, text: str = '', title: str = 'Confirm', buttons: List[str] = None) -> str:
        """Show confirmation dialog with buttons."""
        if buttons is None:
            buttons = ['OK', 'Cancel']
        return pyautogui.confirm(text=text, title=title, buttons=buttons)
    
    def prompt(self, text: str = '', title: str = 'Input', default: str = '') -> Optional[str]:
        """Show input prompt dialog."""
        return pyautogui.prompt(text=text, title=title, default=default)


# ========== QUICK ACCESS FUNCTIONS ==========

# Global controller instance for quick access
_controller = None

def get_controller(**kwargs) -> DesktopController:
    """Get or create global controller instance."""
    global _controller
    if _controller is None:
        _controller = DesktopController(**kwargs)
    return _controller


# Convenience function exports
def move_mouse(x: int, y: int, duration: float = 0) -> None:
    """Quick mouse move."""
    get_controller().move_mouse(x, y, duration)

def click(x: Optional[int] = None, y: Optional[int] = None, button: str = 'left') -> None:
    """Quick click."""
    get_controller().click(x, y, button=button)

def type_text(text: str, wpm: Optional[int] = None) -> None:
    """Quick text typing."""
    get_controller().type_text(text, wpm=wpm)

def hotkey(*keys) -> None:
    """Quick hotkey."""
    get_controller().hotkey(*keys)

def screenshot(filename: Optional[str] = None):
    """Quick screenshot."""
    return get_controller().screenshot(filename=filename)


# ========== DEMONSTRATION ==========

if __name__ == "__main__":
    print("🖱️  Desktop Control Skill - Test Mode")
    print("=" * 50)
    
    # Initialize controller
    dc = DesktopController(failsafe=True)
    
    # Display info
    print(f"\n📺 Screen Size: {dc.get_screen_size()}")
    print(f"🖱️  Current Mouse Position: {dc.get_mouse_position()}")
    
    # Test window operations
    print(f"\n🪟 Active Window: {dc.get_active_window()}")
    
    windows = dc.get_all_windows()
    print(f"\n📋 Open Windows ({len(windows)}):")
    for i, title in enumerate(windows[:10], 1):  # Show first 10
        print(f"  {i}. {title}")
    
    print("\n✅ Desktop Control ready!")
    print("⚠️  Move mouse to any corner to trigger failsafe")
    
    # Keep running to allow testing
    print("\nController is ready. Import this module to use it in your OpenClaw skills!")
