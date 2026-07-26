import { createAndroidBackend } from './backends/android.js';
import { createCodexBackend } from './backends/codex.js';
import { createCuaBackend, killAppProtectionReason, evictOldScreenshots, scanForPromptInjection, resolveCuaDriverPath } from './backends/cua.js';
import { createDesktopBackend } from './backends/desktop.js';
import { errorResult, jsonResult } from './response.js';

const desktopToolSpecs = [
  ['desktop_screenshot', 'Capture a desktop screenshot, optionally with region [x,y,w,h].', { region: { type: 'array', items: { type: 'integer' } } }],
  ['desktop_mouse_move', 'Move the desktop mouse cursor.', { x: { type: 'integer' }, y: { type: 'integer' }, duration: { type: 'number', default: 0 } }, ['x', 'y']],
  ['desktop_mouse_click', 'Click on the desktop.', { x: { type: 'integer' }, y: { type: 'integer' }, button: { type: 'string', default: 'left' }, clicks: { type: 'integer', default: 1 } }],
  ['desktop_mouse_scroll', 'Scroll on the desktop.', { amount: { type: 'integer', default: -3 } }],
  ['desktop_mouse_drag', 'Drag the mouse from current position to target (or start from x,y).', { x: { type: 'integer' }, y: { type: 'integer' }, duration: { type: 'number', default: 0.5 }, button: { type: 'string', default: 'left' } }, ['x', 'y']],
  ['desktop_mouse_double_click', 'Double-click on the desktop.', { x: { type: 'integer' }, y: { type: 'integer' }, button: { type: 'string', default: 'left' } }],
  ['desktop_ocr', 'Extract text from screen using OCR (optional region). Useful for reading UI text.', { region: { type: 'array', items: { type: 'integer' } }, language: { type: 'string', default: 'eng' } }],
  ['desktop_key_down', 'Press and hold a key down.', { key: { type: 'string' } }, ['key']],
  ['desktop_key_up', 'Release a held key.', { key: { type: 'string' } }, ['key']],
  ['desktop_get_active_window', 'Get information about the currently active/focused window.', {}],
  ['desktop_find_image', 'Find an image on screen (template matching). Returns location if found.', { image_path: { type: 'string' }, confidence: { type: 'number', default: 0.9 } }, ['image_path']],
  ['desktop_scroll_direction', 'Scroll in a specific direction (up, down, left, right).', { direction: { type: 'string', default: 'down' }, amount: { type: 'integer', default: 3 } }],
  ['desktop_wait', 'Wait for a number of seconds (useful for timing UI changes).', { seconds: { type: 'number', default: 1 } }],
  ['desktop_get_all_windows', 'List all visible windows with basic info.', {}],
  ['desktop_minimize_window', 'Minimize a window by title.', { title: { type: 'string' } }, ['title']],
  ['desktop_maximize_window', 'Maximize a window by title.', { title: { type: 'string' } }, ['title']],
  ['desktop_restore_window', 'Restore a minimized/maximized window by title.', { title: { type: 'string' } }, ['title']],
  ['desktop_close_window', 'Close a window by title.', { title: { type: 'string' } }, ['title']],
  ['desktop_move_window', 'Move a window by title to new position.', { title: { type: 'string' }, x: { type: 'integer' }, y: { type: 'integer' } }, ['title', 'x', 'y']],
  ['desktop_resize_window', 'Resize a window by title.', { title: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' } }, ['title', 'width', 'height']],
  ['desktop_get_monitors', 'List all connected monitors/screens.', {}],
  ['desktop_list_processes', 'List running processes (limited).', {}],
  ['desktop_kill_process', 'Terminate a process by PID.', { pid: { type: 'integer' } }, ['pid']],
  ['desktop_keyboard_type', 'Type text on the desktop.', { text: { type: 'string' }, interval: { type: 'number', default: 0 } }, ['text']],
  ['desktop_keyboard_press', 'Press one desktop key.', { key: { type: 'string' } }, ['key']],
  ['desktop_keyboard_hotkey', 'Press a desktop key combination.', { keys: { type: 'array', items: { type: 'string' } } }, ['keys']],
  ['desktop_keyboard', 'Compatibility keyboard tool: type text or press a key.', { text: { type: 'string' }, key: { type: 'string' }, press: { type: 'string' }, presses: { type: 'integer', default: 1 } }],
  ['desktop_cursor_position', 'Get the desktop cursor position.', {}],
  ['desktop_get_screen_size', 'Get desktop screen size.', {}],
  ['desktop_get_pixel_color', 'Get a desktop pixel color.', { x: { type: 'integer' }, y: { type: 'integer' } }, ['x', 'y']],
  ['desktop_clipboard_read', 'Read desktop clipboard text.', {}],
  ['desktop_clipboard_write', 'Write desktop clipboard text.', { text: { type: 'string' } }, ['text']],
  ['desktop_launch_app', 'Launch or open an app, app path, or URL. On macOS it opens in the background by default so the MCP client keeps focus; set foreground=true only when needed.', { app: { type: 'string' }, path: { type: 'string' }, url: { type: 'string' }, foreground: { type: 'boolean' } }],
  ['desktop_window_list', 'List desktop windows or apps.', {}],
  ['desktop_window_activate', 'Activate a desktop window by title.', { title: { type: 'string' }, pid: { type: 'integer' } }],
  ['desktop_run_script', 'Run a local Python or shell script.', { path: { type: 'string' }, timeout: { type: 'integer', default: 30 } }, ['path']],
  ['desktop_file_read', 'Read text from a local file.', { path: { type: 'string' }, limit: { type: 'integer', default: 10000 } }, ['path']],
  ['desktop_file_write', 'Write text to a local file.', { path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']],
  ['desktop_terminal', 'Run a local shell command.', { command: { type: 'string' }, timeout: { type: 'integer', default: 30 } }, ['command']],
  ['desktop_rs_lookup', 'Run the local RuneScape lookup helper when available.', { player: { type: 'string' }, clan: { type: 'string' } }],
  ['desktop_mouse_hover', 'Move the mouse to (x, y) and hold position; useful for triggering hover UI states.', { x: { type: 'integer' }, y: { type: 'integer' }, duration: { type: 'number', default: 0 } }, ['x', 'y']],
  ['desktop_mouse_right_click', 'Right-click on the desktop (optionally at x, y).', { x: { type: 'integer' }, y: { type: 'integer' } }],
  ['desktop_mouse_middle_click', 'Middle-click on the desktop (optionally at x, y).', { x: { type: 'integer' }, y: { type: 'integer' } }],
  ['desktop_focus_window', 'Bring the window with the matching title to the foreground (cross-platform fallback).', { title: { type: 'string' } }, ['title']],
  ['desktop_screenshot_window', 'Capture a screenshot of a specific window by title.', { title: { type: 'string' } }, ['title']],
  ['desktop_get_window_info', 'Return position, size, and state info for the window with the matching title.', { title: { type: 'string' } }, ['title']],
  ['desktop_wait_for_image', 'Poll the screen until an image appears at the given template path, or timeout.', { image_path: { type: 'string' }, timeout: { type: 'number', default: 10 }, confidence: { type: 'number', default: 0.9 } }, ['image_path']],
];

// ---------------------------------------------------------------------------
// CUA (Computer-Use Agent) tools — wrap trycua/cua-driver for background-mode
// desktop control. Unlike the pyautogui-based tools above, these dispatch input
// via platform accessibility APIs (AX on macOS, UIA on Windows, AT-SPI2 on Linux)
// so the user's real cursor never moves. Requires cua-driver installed:
//
//   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"
//
// On macOS, grant Accessibility + Screen Recording permissions to
// /Applications/CuaDriver.app on first run.
// ---------------------------------------------------------------------------
const cuaToolSpecs = [
  [
    'desktop_launch_app_cua',
    'Launch a macOS app in the background (CUA backend variant — does NOT come to foreground). Use this instead of desktop_launch_app when you want the CUA behavior.',
    { name: { type: 'string' }, bundle_id: { type: 'string' } },
  ],
  [
    'desktop_ax_tree',
    'Return a structured accessibility tree of running apps (and optionally one window with element_index handles). Background-mode safe — no cursor moves.',
    {
      pid: { type: 'integer', description: 'Optional pid to deep-snapshot one window.' },
      window_id: { type: 'integer', description: 'Optional explicit window_id (auto-resolved from pid if omitted).' },
      max_elements: { type: 'integer', default: 500 },
      max_depth: { type: 'integer', default: 12 },
    },
  ],
  [
    'desktop_list_apps',
    'List macOS apps (both running and installed-but-not-running) with per-app state flags. Background-mode safe.',
    {},
  ],
  [
    'desktop_focus_app',
    'Route input to a background app without stealing focus. On macOS this is implicit (CGEventPostToPid reaches backgrounded apps); this tool resolves pid and calls bring_to_front for parity.',
    {
      pid: { type: 'integer' },
      name: { type: 'string', description: 'App name (resolved to pid automatically).' },
    },
  ],
  [
    'desktop_som_capture',
    'Capture a window screenshot with SOM-labeled AX tree. Returns {image, title, elements:[{element_index, role, label, frame}], tree_markdown}. Click via desktop_click_element(element_index=N) afterwards.',
    {
      pid: { type: 'integer' },
      window_id: { type: 'integer' },
      max_elements: { type: 'integer', default: 800 },
      max_depth: { type: 'integer', default: 15 },
    },
  ],
  [
    'desktop_click_element',
    'Click by element_index (preferred — works on backgrounded windows, no cursor move) or pixel coordinates. Use desktop_som_capture first to get element_index handles.',
    {
      pid: { type: 'integer' },
      window_id: { type: 'integer' },
      element_index: { type: 'integer', description: 'Preferred. Index from prior desktop_som_capture.' },
      x: { type: 'integer' },
      y: { type: 'integer' },
      button: { type: 'string', default: 'left', enum: ['left', 'right', 'middle'] },
      action: { type: 'string', default: 'press', enum: ['press', 'show_menu', 'pick', 'confirm', 'cancel', 'open'] },
      capture_after: { type: 'boolean', default: false, description: 'Capture screenshot after the click for verification.' },
    },
  ],
  [
    'desktop_drag_element',
    'Drag by element_index pair (from_index, to_index) or pixel coordinates.',
    {
      pid: { type: 'integer' },
      window_id: { type: 'integer' },
      from_index: { type: 'integer' },
      to_index: { type: 'integer' },
      from_x: { type: 'integer' },
      from_y: { type: 'integer' },
      to_x: { type: 'integer' },
      to_y: { type: 'integer' },
    },
  ],
  [
    'desktop_type_into',
    'Type text into a focused element by element_index (preferred) or just to the pid (sends to focused control).',
    {
      pid: { type: 'integer' },
      window_id: { type: 'integer' },
      element_index: { type: 'integer' },
      text: { type: 'string' },
    },
  ],
  [
    'desktop_key_combo',
    'Press a hotkey combination (e.g. ["cmd","shift","p"]).',
    { keys: { type: 'array', items: { type: 'string' } }, pid: { type: 'integer' } },
  ],
  [
    'desktop_kill_app',
    'Terminate a process by pid with safety guards. Refuses pid=1, kernel_task, WindowServer, loginwindow, launchd, and any pid<50. Hard-blocked, not overridable by env.',
    { pid: { type: 'integer' } },
    ['pid'],
  ],
  [
    'desktop_screenshot_prompt_guard',
    'OCR + prompt-injection scan. Pass either text= for direct scan, or take a fresh screenshot and scan it. Returns {safe, reasons, ocr_text}.',
    { text: { type: 'string' } },
  ],
  [
    'desktop_evict_screenshots',
    'Token-aware eviction: keep the most recent N screenshots, summarize the rest. Pure utility — pass history[] and get back {kept, evicted, summary}.',
    {
      history: { type: 'array', description: 'Array of {ts, data, summary?} items.' },
      keep_last_n: { type: 'integer', default: 5 },
    },
  ],
];

const androidToolSpecs = [
  ['android_devices', 'List connected Android devices.', {}],
  ['android_screenshot', 'Capture an Android screenshot.', { device: { type: 'string' } }],
  ['android_screen_size', 'Get Android physical screen size.', { device: { type: 'string' } }],
  ['android_current_activity', 'Get Android focused package and activity.', { device: { type: 'string' } }],
  ['android_tap', 'Tap an Android screen coordinate.', { device: { type: 'string' }, x: { type: 'integer' }, y: { type: 'integer' } }, ['x', 'y']],
  ['android_swipe', 'Swipe on Android.', { device: { type: 'string' }, x1: { type: 'integer' }, y1: { type: 'integer' }, x2: { type: 'integer' }, y2: { type: 'integer' }, duration: { type: 'integer', default: 300 } }, ['x1', 'y1', 'x2', 'y2']],
  ['android_text', 'Type text on Android.', { device: { type: 'string' }, text: { type: 'string' } }, ['text']],
  ['android_key', 'Send an Android key event.', { device: { type: 'string' }, key: { type: 'string' } }, ['key']],
  ['android_launch_app', 'Launch an Android app package.', { device: { type: 'string' }, package: { type: 'string' } }, ['package']],
  ['android_ui_dump', 'Dump Android UI XML.', { device: { type: 'string' } }],
  ['android_logcat', 'Capture Android logcat.', { device: { type: 'string' }, lines: { type: 'integer', default: 200 } }],
];

const aliasMap = {
  screenshot: 'desktop_screenshot',
  mouse_move: 'desktop_mouse_move',
  mouse_click: 'desktop_mouse_click',
  mouse_scroll: 'desktop_mouse_scroll',
  keyboard_type: 'desktop_keyboard_type',
  keyboard_press: 'desktop_keyboard_press',
  keyboard_hotkey: 'desktop_keyboard_hotkey',
  keyboard: 'desktop_keyboard',
  cursor_position: 'desktop_cursor_position',
  get_screen_size: 'desktop_get_screen_size',
  get_pixel_color: 'desktop_get_pixel_color',
  clipboard_read: 'desktop_clipboard_read',
  clipboard_write: 'desktop_clipboard_write',
  launch_app: 'desktop_launch_app',
  window_list: 'desktop_window_list',
  window_activate: 'desktop_window_activate',
  run_script: 'desktop_run_script',
  file_read: 'desktop_file_read',
  file_write: 'desktop_file_write',
  terminal: 'desktop_terminal',
  rs_lookup: 'desktop_rs_lookup',
  computer_use_screenshot: 'desktop_screenshot',
  computer_use_mouse_move: 'desktop_mouse_move',
  computer_use_mouse_click: 'desktop_mouse_click',
  computer_use_mouse_scroll: 'desktop_mouse_scroll',
  computer_use_keyboard: 'desktop_keyboard',
  computer_use_cursor_position: 'desktop_cursor_position',
  computer_use_launch_app: 'desktop_launch_app',
};

function toolSpec(name, description, properties = {}, required = []) {
  return { name, description, inputSchema: { type: 'object', properties, required } };
}

export function createToolRegistry(backends = {}) {
  const desktop = backends.desktop ?? createDesktopBackend();
  const android = backends.android ?? createAndroidBackend();
  const codex = backends.codex ?? createCodexBackend();
  const cua = backends.cua ?? createCuaBackend();

  const specs = [
    ...desktopToolSpecs.map((spec) => toolSpec(...spec)),
    ...cuaToolSpecs.map((spec) => toolSpec(...spec)),
    ...androidToolSpecs.map((spec) => toolSpec(...spec)),
    toolSpec('backend_status', 'Report desktop, Android, and Codex backend availability.'),
    toolSpec('codex_mcp_config', 'Return a ready-to-use Codex Computer Use MCP config when the supported binary is available.'),
    toolSpec('permissions_check', 'Report local permissions and dependency hints.'),
    ...Object.entries(aliasMap).map(([alias, target]) => {
      const base = [...desktopToolSpecs, ...androidToolSpecs].find(([name]) => name === target);
      return toolSpec(alias, `Compatibility alias for ${target}.`, base?.[2] ?? {}, base?.[3] ?? []);
    }),
  ];

  const handlers = {
    desktop_screenshot: (args) => desktop.screenshot(args),
    desktop_mouse_move: (args) => desktop.mouseMove(args),
    desktop_mouse_click: (args) => desktop.mouseClick(args),
    desktop_mouse_scroll: (args) => desktop.mouseScroll(args),
    desktop_mouse_drag: (args) => desktop.mouseDrag(args),
    desktop_mouse_double_click: (args) => desktop.mouseDoubleClick(args),
    desktop_key_down: (args) => desktop.keyDown(args),
    desktop_key_up: (args) => desktop.keyUp(args),
    desktop_get_active_window: (args) => desktop.getActiveWindow(args),
    desktop_find_image: (args) => desktop.findImage(args),
    desktop_scroll_direction: (args) => desktop.scrollDirection(args),
    desktop_ocr: (args) => desktop.ocr(args),
    desktop_keyboard_type: (args) => desktop.keyboardType(args),
    desktop_keyboard_press: (args) => desktop.keyboardPress(args),
    desktop_keyboard_hotkey: (args) => desktop.keyboardHotkey(args),
    desktop_keyboard: (args) => desktop.keyboard(args),
    desktop_cursor_position: (args) => desktop.cursorPosition(args),
    desktop_get_screen_size: (args) => desktop.getScreenSize(args),
    desktop_get_pixel_color: (args) => desktop.getPixelColor(args),
    desktop_clipboard_read: (args) => desktop.clipboardRead(args),
    desktop_clipboard_write: (args) => desktop.clipboardWrite(args),
    desktop_launch_app: (args) => desktop.launchApp(args),
    desktop_window_list: (args) => desktop.windowList(args),
    desktop_window_activate: (args) => desktop.windowActivate(args),
    desktop_run_script: (args) => desktop.runScript(args),
    desktop_file_read: (args) => desktop.fileRead(args),
    desktop_file_write: (args) => desktop.fileWrite(args),
    desktop_terminal: (args) => desktop.terminal(args),
    desktop_rs_lookup: (args) => desktop.rsLookup(args),
    desktop_mouse_hover: (args) => desktop.mouseHover(args),
    desktop_mouse_right_click: (args) => desktop.rightClick(args),
    desktop_mouse_middle_click: (args) => desktop.middleClick(args),
    desktop_focus_window: (args) => desktop.focusWindow(args),
    desktop_screenshot_window: (args) => desktop.screenshotWindow(args),
    desktop_get_window_info: (args) => desktop.getWindowInfo(args),
    desktop_wait_for_image: (args) => desktop.waitForImage(args),
    desktop_get_all_windows: (args) => desktop.getAllWindows(args),
    desktop_minimize_window: (args) => desktop.minimizeWindow(args),
    desktop_maximize_window: (args) => desktop.maximizeWindow(args),
    desktop_restore_window: (args) => desktop.restoreWindow(args),
    desktop_close_window: (args) => desktop.closeWindow(args),
    desktop_move_window: (args) => desktop.moveWindow(args),
    desktop_resize_window: (args) => desktop.resizeWindow(args),
    desktop_get_monitors: (args) => desktop.getMonitors(args),
    desktop_list_processes: (args) => desktop.listProcesses(args),
    desktop_kill_process: (args) => desktop.killProcess(args),
    desktop_wait: (args) => desktop.wait(args),

    // -----------------------------------------------------------------------
    // CUA (Computer-Use Agent) tools — background-mode desktop control via
    // cua-driver. The user's cursor never moves and keyboard focus stays theirs.
    // Names prefixed desktop_* intentionally: the alias map below redirects
    // launch_app / computer_use_launch_app to desktop_launch_app (desktop backend),
    // NOT the CUA one. To use the CUA variant, call desktop_launch_app_cua.
    // -----------------------------------------------------------------------
    desktop_launch_app_cua: (args) => cua.launchApp(args ?? {}),
    desktop_ax_tree: async (args) => cua.axTree(args ?? {}),
    desktop_list_apps: async (args) => cua.listApps(args ?? {}),
    desktop_focus_app: async (args) => cua.focusApp(args ?? {}),
    desktop_som_capture: async (args) => cua.somCapture(args ?? {}),
    desktop_click_element: async (args) => {
      const result = await cua.clickElement(args ?? {});
      if (args?.capture_after) {
        try {
          const after = await cua.somCapture({ pid: args.pid, window_id: args.window_id, max_elements: 50, max_depth: 5 });
          return {
            ...result,
            content: [
              ...(result.content ?? []),
              { type: 'text', text: JSON.stringify({ capture_after: { elements: after.elements?.slice(0, 20), title: after.title } }) },
            ],
          };
        } catch {
          return result;
        }
      }
      return result;
    },
    desktop_drag_element: async (args) => cua.dragElement(args ?? {}),
    desktop_type_into: async (args) => cua.typeInto(args ?? {}),
    desktop_key_combo: async (args) => cua.keyCombo(args ?? {}),
    desktop_kill_app: async (args) => {
      // Defense-in-depth: re-check here even though backend does it too
      const reason = killAppProtectionReason(Number(args?.pid));
      if (reason) {
        return errorResult(`kill_app blocked: ${reason} (pid=${args?.pid})`);
      }
      return cua.killApp(args ?? {});
    },
    desktop_screenshot_prompt_guard: async (args) => cua.screenshotPromptGuard(args ?? {}),
    desktop_evict_screenshots: async (args) => {
      const history = Array.isArray(args?.history) ? args.history : [];
      const result = evictOldScreenshots(history, { keep_last_n: Number(args?.keep_last_n ?? 5) });
      return jsonResult(result);
    },
    android_devices: (args) => android.devices(args),
    android_screenshot: (args) => android.screenshot(args),
    android_screen_size: (args) => android.screenSize(args),
    android_current_activity: (args) => android.currentActivity(args),
    android_tap: (args) => android.tap(args),
    android_swipe: (args) => android.swipe(args),
    android_text: (args) => android.text(args),
    android_key: (args) => android.key(args),
    android_launch_app: (args) => android.launchApp(args),
    android_ui_dump: (args) => android.uiDump(args),
    android_logcat: (args) => android.logcat(args),
    backend_status: async () => jsonResult({
      desktop: await desktop.status(),
      cua: await cua.status(),
      android: await android.status(),
      codex: await codex.status(),
      cua_driver_path: resolveCuaDriverPath(),
    }),
    codex_mcp_config: async () => jsonResult(codex.mcpConfig()),
    permissions_check: async () => jsonResult({
      macos: {
        screenRecording: 'Required for screenshots through Codex Computer Use or screencapture.',
        accessibility: 'Required for PyAutoGUI mouse and keyboard control.',
        cuaDriver: 'Required for background-mode CUA tools (desktop_ax_tree, desktop_click_element, etc.). Grant Accessibility + Screen Recording to /Applications/CuaDriver.app.',
      },
      android: {
        adb: 'Required for Android device controls.',
        deviceSetup: 'Enable Developer Options and USB debugging, or start an emulator.',
      },
    }),
  };

  return {
    listTools() {
      return { tools: specs };
    },
    async callTool(name, args = {}) {
      const target = aliasMap[name] ?? name;
      const handler = handlers[target];
      if (!handler) return errorResult(`Unknown tool: ${name}`);
      try {
        const result = await handler(args);
        return result ?? { content: [] };
      } catch (error) {
        return errorResult(error.message);
      }
    },
  };
}
