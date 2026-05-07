import { createAndroidBackend } from './backends/android.js';
import { createCodexBackend } from './backends/codex.js';
import { createDesktopBackend } from './backends/desktop.js';
import { errorResult, jsonResult } from './response.js';

const desktopToolSpecs = [
  ['desktop_screenshot', 'Capture a desktop screenshot, optionally with region [x,y,w,h].', { region: { type: 'array', items: { type: 'integer' } } }],
  ['desktop_mouse_move', 'Move the desktop mouse cursor.', { x: { type: 'integer' }, y: { type: 'integer' }, duration: { type: 'number', default: 0 } }, ['x', 'y']],
  ['desktop_mouse_click', 'Click on the desktop.', { x: { type: 'integer' }, y: { type: 'integer' }, button: { type: 'string', default: 'left' }, clicks: { type: 'integer', default: 1 } }],
  ['desktop_mouse_scroll', 'Scroll on the desktop.', { amount: { type: 'integer', default: -3 } }],
  ['desktop_keyboard_type', 'Type text on the desktop.', { text: { type: 'string' }, interval: { type: 'number', default: 0 } }, ['text']],
  ['desktop_keyboard_press', 'Press one desktop key.', { key: { type: 'string' } }, ['key']],
  ['desktop_keyboard_hotkey', 'Press a desktop key combination.', { keys: { type: 'array', items: { type: 'string' } } }, ['keys']],
  ['desktop_keyboard', 'Compatibility keyboard tool: type text or press a key.', { text: { type: 'string' }, key: { type: 'string' }, press: { type: 'string' }, presses: { type: 'integer', default: 1 } }],
  ['desktop_cursor_position', 'Get the desktop cursor position.', {}],
  ['desktop_get_screen_size', 'Get desktop screen size.', {}],
  ['desktop_get_pixel_color', 'Get a desktop pixel color.', { x: { type: 'integer' }, y: { type: 'integer' } }, ['x', 'y']],
  ['desktop_clipboard_read', 'Read desktop clipboard text.', {}],
  ['desktop_clipboard_write', 'Write desktop clipboard text.', { text: { type: 'string' } }, ['text']],
  ['desktop_launch_app', 'Launch or open a macOS app, app path, or URL.', { app: { type: 'string' }, path: { type: 'string' }, url: { type: 'string' } }],
  ['desktop_window_list', 'List desktop windows or apps.', {}],
  ['desktop_window_activate', 'Activate a desktop window by title.', { title: { type: 'string' }, pid: { type: 'integer' } }],
  ['desktop_run_script', 'Run a local Python or shell script.', { path: { type: 'string' }, timeout: { type: 'integer', default: 30 } }, ['path']],
  ['desktop_file_read', 'Read text from a local file.', { path: { type: 'string' }, limit: { type: 'integer', default: 10000 } }, ['path']],
  ['desktop_file_write', 'Write text to a local file.', { path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']],
  ['desktop_terminal', 'Run a local shell command.', { command: { type: 'string' }, timeout: { type: 'integer', default: 30 } }, ['command']],
  ['desktop_rs_lookup', 'Run the local RuneScape lookup helper when available.', { player: { type: 'string' }, clan: { type: 'string' } }],
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

  const specs = [
    ...desktopToolSpecs.map((spec) => toolSpec(...spec)),
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
      android: await android.status(),
      codex: await codex.status(),
    }),
    codex_mcp_config: async () => jsonResult(codex.mcpConfig()),
    permissions_check: async () => jsonResult({
      macos: {
        screenRecording: 'Required for screenshots through Codex Computer Use or screencapture.',
        accessibility: 'Required for PyAutoGUI mouse and keyboard control.',
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
