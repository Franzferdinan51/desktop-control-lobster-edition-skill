import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageResult, jsonResult, textResult } from '../response.js';
import { runFile, runFileWithInput } from '../process.js';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_ACTION = join(__dirname, '..', '..', 'scripts', 'pyautogui_action.py');

// Resolve the RuneScape lookup helper in this order:
//   1. NEWEST_DC_RS_TOOL_PATH (preferred, generic)
//   2. DUCKETS_RS_TOOL_PATH   (legacy DuckBot-specific override)
//   3. ~/Desktop/rs-agent-tools/mcp-launcher.py (developer default)
//   4. ~/rs-agent-tools/mcp-launcher.py        (portable default)
// `null` means "the tool is not installed on this machine" and the
// `desktop_rs_lookup` handler will throw a clear error when called.
//
// Resolved lazily on every call so env overrides (and tests) can change
// the candidate set without re-importing this module.
function getDefaultRsToolPaths() {
  return [
    process.env.NEWEST_DC_RS_TOOL_PATH,
    process.env.DUCKETS_RS_TOOL_PATH,
    join(homedir(), 'Desktop', 'rs-agent-tools', 'mcp-launcher.py'),
    join(homedir(), 'rs-agent-tools', 'mcp-launcher.py'),
  ].filter(Boolean);
}

function resolveRsToolPath() {
  return getDefaultRsToolPaths().find((path) => existsSync(path)) ?? null;
}

export { resolveRsToolPath, getDefaultRsToolPaths as DEFAULT_RS_TOOL_PATHS };

// Cross-platform Python command: Windows uses 'python', macOS/Linux uses 'python3'
function pythonCmd(platform = process.platform) {
  return platform === 'win32' ? 'python' : 'python3';
}

function powershellEscape(value) {
  return String(value).replace(/'/g, "''");
}

async function commandExists(command, platform = process.platform) {
  const checker = platform === 'win32' ? { command: 'where.exe', args: [command] } : { command: 'command', args: ['-v', command] };
  try {
    if (checker.command === 'command') await runFile('/bin/sh', ['-lc', `command -v ${command}`], { timeout: 3000 });
    else await runFile(checker.command, checker.args, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function firstAvailable(candidates, platform = process.platform) {
  for (const candidate of candidates) {
    if (candidate.command.includes('/') || await commandExists(candidate.command, platform)) return candidate;
  }
  return null;
}

async function runPython(action, args = {}) {
  const payload = JSON.stringify({ action, args });
  const { stdout } = await runFileWithInput(pythonCmd(), [PY_ACTION], payload, { timeout: 30000 });
  const text = stdout.toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

async function runAppleScript(script) {
  const { stdout } = await runFile('osascript', ['-e', script], { timeout: 15000 });
  return stdout.trim();
}

export function platformClipboardReadCandidates(platform) {
  if (platform === 'darwin') return [{ command: 'pbpaste', args: [] }];
  if (platform === 'win32') return [{ command: 'powershell.exe', args: ['-NoProfile', '-Command', 'Get-Clipboard'] }];
  return [
    { command: 'wl-paste', args: ['--no-newline'] },
    { command: 'xclip', args: ['-selection', 'clipboard', '-out'] },
    { command: 'xsel', args: ['--clipboard', '--output'] },
  ];
}

export function platformClipboardWriteCandidates(platform) {
  if (platform === 'darwin') return [{ command: 'pbcopy', args: [] }];
  if (platform === 'win32') return [{ command: 'powershell.exe', args: ['-NoProfile', '-Command', '$input | Set-Clipboard'] }];
  return [
    { command: 'wl-copy', args: [] },
    { command: 'xclip', args: ['-selection', 'clipboard'] },
    { command: 'xsel', args: ['--clipboard', '--input'] },
  ];
}

export function platformLaunchCommand(platform, args = {}) {
  const target = args.url ?? args.path ?? args.app;
  if (!target) throw new Error('desktop_launch_app requires app, path, or url');
  if (platform === 'darwin') {
    if (args.app && !args.path && !args.url) return { command: 'open', args: ['-a', String(args.app)] };
    return { command: 'open', args: [String(target)] };
  }
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/c', 'start', '', String(target)] };
  return { command: 'xdg-open', args: [String(target)] };
}

export function platformShellCommand(platform, command) {
  if (platform === 'win32') return { command: 'powershell.exe', args: ['-NoProfile', '-Command', command] };
  return { command: '/bin/sh', args: ['-lc', command] };
}

function platformWindowListCommand(platform) {
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-Command', 'Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress'],
    };
  }
  if (platform === 'linux') return { command: 'wmctrl', args: ['-lxp'] };
  return null;
}

function platformWindowActivateCommand(platform, args = {}) {
  if (platform === 'win32') {
    if (args.pid) {
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-Command', `$p = Get-Process -Id ${Number(args.pid)}; Add-Type -Name NativeMethods -Namespace Win32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'; [Win32.NativeMethods]::SetForegroundWindow($p.MainWindowHandle)`],
      };
    }
    if (!args.title) throw new Error('window_activate requires title or pid');
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-Command', `$p = Get-Process | Where-Object {$_.MainWindowTitle -like '*${powershellEscape(args.title)}*'} | Select-Object -First 1; Add-Type -Name NativeMethods -Namespace Win32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'; [Win32.NativeMethods]::SetForegroundWindow($p.MainWindowHandle)`],
    };
  }
  if (platform === 'linux') {
    if (!args.title) throw new Error('window_activate on Linux requires title');
    return { command: 'wmctrl', args: ['-a', String(args.title)] };
  }
  return null;
}

export function createDesktopBackend(options = {}) {
  const platform = options.platform ?? process.platform;
  return {
    async status() {
      const checks = { platform };
      try {
        await runFile(pythonCmd(), ['--version']);
        checks.python3 = true;
        try {
          await runFile(pythonCmd(), ['-c', 'import pyautogui, PIL']);
          checks.pyautogui = true;
        } catch (error) {
          checks.pyautogui = false;
          checks.pyautoguiError = error.message;
        }
      } catch (error) {
        checks.python3 = false;
        checks.pythonError = error.message;
      }
      if (platform === 'darwin') {
        checks.screencapture = await commandExists('screencapture', platform);
        checks.pbcopy = await commandExists('pbcopy', platform);
        checks.pbpaste = await commandExists('pbpaste', platform);
        checks.osascript = await commandExists('osascript', platform);
      } else if (platform === 'linux') {
        checks.xdgOpen = await commandExists('xdg-open', platform);
        checks.wmctrl = await commandExists('wmctrl', platform);
        checks.clipboard = Boolean(await firstAvailable(platformClipboardReadCandidates(platform), platform));
      } else if (platform === 'win32') {
        checks.powershell = await commandExists('powershell.exe', platform);
        checks.cmd = await commandExists('cmd.exe', platform);
      }
      return { available: true, detail: checks };
    },

    async screenshot(args = {}) {
      if (platform === 'darwin') {
        const commandArgs = ['-x', '-t', 'png'];
        if (args.region) commandArgs.push('-R', args.region.join(','));
        commandArgs.push('-');
        const { stdout } = await runFile('screencapture', commandArgs, {
          encoding: 'buffer',
          maxBuffer: 1024 * 1024 * 50,
        });
        return imageResult(Buffer.from(stdout).toString('base64'));
      }
      const result = await runPython('screenshot', args);
      return imageResult(result.image);
    },

    async mouseMove(args = {}) {
      await runPython('mouse_move', args);
      return textResult(`Moved desktop mouse to (${args.x}, ${args.y})`);
    },

    async mouseClick(args = {}) {
      await runPython('mouse_click', args);
      return textResult('Clicked desktop mouse');
    },

    async mouseScroll(args = {}) {
      const amount = args.amount ?? args.clicks ?? args.delta_y ?? -3;
      await runPython('mouse_scroll', { ...args, amount });
      return textResult(`Scrolled desktop by ${amount}`);
    },

    async mouseDrag(args = {}) {
      await runPython('mouse_drag', args);
      return textResult(`Dragged mouse to (${args.x}, ${args.y})`);
    },

    async mouseDoubleClick(args = {}) {
      await runPython('mouse_double_click', args);
      return textResult('Double-clicked desktop mouse');
    },

    async keyDown(args = {}) {
      await runPython('key_down', args);
      return textResult(`Key down: ${args.key}`);
    },

    async keyUp(args = {}) {
      await runPython('key_up', args);
      return textResult(`Key up: ${args.key}`);
    },

    async getActiveWindow() {
      return jsonResult(await runPython('get_active_window'));
    },

    async findImage(args = {}) {
      const result = await runPython('find_image', args);
      return jsonResult(result);
    },

    async scrollDirection(args = {}) {
      await runPython('scroll_direction', args);
      return textResult(`Scrolled ${args.direction || 'down'}`);
    },

    async ocr(args = {}) {
      const result = await runPython('ocr', args);
      if (result.error) {
        return textResult(`OCR error: ${result.error}`);
      }
      return jsonResult({ text: result.text || '', error: result.error });
    },

    async wait(args = {}) {
      await runPython('wait', args);
      return textResult(`Waited ${args.seconds || 1} seconds`);
    },

    async getAllWindows() {
      return jsonResult(await runPython('get_all_windows'));
    },

    async minimizeWindow(args = {}) {
      await runPython('minimize_window', args);
      return textResult(`Minimized window: ${args.title || 'active'}`);
    },

    async maximizeWindow(args = {}) {
      await runPython('maximize_window', args);
      return textResult(`Maximized window: ${args.title || 'active'}`);
    },

    async restoreWindow(args = {}) {
      await runPython('restore_window', args);
      return textResult(`Restored window: ${args.title || 'active'}`);
    },

    async closeWindow(args = {}) {
      await runPython('close_window', args);
      return textResult(`Closed window: ${args.title || 'active'}`);
    },

    async moveWindow(args = {}) {
      await runPython('move_window', args);
      return textResult(`Moved window: ${args.title || 'active'} to (${args.x}, ${args.y})`);
    },

    async resizeWindow(args = {}) {
      await runPython('resize_window', args);
      return textResult(`Resized window: ${args.title || 'active'} to ${args.width}x${args.height}`);
    },

    async getMonitors() {
      return jsonResult(await runPython('get_monitors'));
    },

    async listProcesses() {
      return jsonResult(await runPython('list_processes'));
    },

    async killProcess(args = {}) {
      await runPython('kill_process', args);
      return textResult(`Killed process ${args.pid}`);
    },

    async keyboardType(args = {}) {
      await runPython('keyboard_type', args);
      return textResult(`Typed ${String(args.text ?? '').length} characters on desktop`);
    },

    async keyboardPress(args = {}) {
      const presses = Math.max(1, Number(args.presses ?? 1));
      for (let index = 0; index < presses; index += 1) {
        await runPython('keyboard_press', args);
      }
      return textResult(`Pressed desktop key ${args.key} ${presses} time(s)`);
    },

    async keyboardHotkey(args = {}) {
      await runPython('keyboard_hotkey', args);
      return textResult(`Pressed desktop hotkey ${args.keys.join('+')}`);
    },

    async keyboard(args = {}) {
      if (args.text) return this.keyboardType(args);
      const key = args.key ?? args.press;
      if (key) return this.keyboardPress({ ...args, key });
      throw new Error('desktop_keyboard requires text, key, or press');
    },

    async cursorPosition() {
      return jsonResult(await runPython('cursor_position'));
    },

    async getScreenSize() {
      return jsonResult(await runPython('screen_size'));
    },

    async getPixelColor(args = {}) {
      return jsonResult(await runPython('pixel_color', args));
    },

    async clipboardRead() {
      const candidate = await firstAvailable(platformClipboardReadCandidates(platform), platform);
      if (!candidate) throw new Error(`No clipboard read command found for ${platform}`);
      const { stdout } = await runFile(candidate.command, candidate.args);
      return textResult(stdout);
    },

    async clipboardWrite(args = {}) {
      const candidate = await firstAvailable(platformClipboardWriteCandidates(platform), platform);
      if (!candidate) throw new Error(`No clipboard write command found for ${platform}`);
      await runFileWithInput(candidate.command, candidate.args, args.text ?? '');
      return textResult(`Copied ${String(args.text ?? '').length} characters to desktop clipboard`);
    },

    async launchApp(args = {}) {
      const command = platformLaunchCommand(platform, args);
      await runFile(command.command, command.args);
      return textResult(`Launched ${args.url ?? args.path ?? args.app}`);
    },

    async windowList() {
      if (platform !== 'darwin') {
        const command = platformWindowListCommand(platform);
        if (!command) throw new Error(`window_list is not supported on ${platform}`);
        const { stdout } = await runFile(command.command, command.args, { maxBuffer: 1024 * 1024 * 5 });
        return textResult(stdout);
      }
      const script = 'tell application "System Events" to get name of every process whose background only is false';
      const output = await runAppleScript(script);
      const apps = output ? output.split(', ').filter(Boolean) : [];
      return jsonResult({ apps });
    },

    async windowActivate(args = {}) {
      if (platform !== 'darwin') {
        const command = platformWindowActivateCommand(platform, args);
        if (!command) throw new Error(`window_activate is not supported on ${platform}`);
        await runFile(command.command, command.args);
        return textResult(`Activated ${args.pid ?? args.title}`);
      }
      if (args.pid) {
        await runAppleScript(`tell application "System Events" to set frontmost of first process whose unix id is ${Number(args.pid)} to true`);
        return textResult(`Activated process ${args.pid}`);
      }
      if (!args.title) throw new Error('window_activate requires title or pid');
      const safeTitle = String(args.title).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await runAppleScript(`tell application "${safeTitle}" to activate`);
      return textResult(`Activated ${args.title}`);
    },

    async runScript(args = {}) {
      if (!args.path) throw new Error('desktop_run_script requires path');
      if (!existsSync(args.path)) throw new Error(`Script not found: ${args.path}`);
      const path = String(args.path);
      const command = path.endsWith('.py')
        ? { command: pythonCmd(), args: [path] }
        : platform === 'win32' && path.endsWith('.ps1')
          ? { command: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path] }
          : platform === 'win32'
            ? { command: 'cmd.exe', args: ['/c', path] }
            : { command: 'bash', args: [path] };
      const { stdout, stderr } = await runFile(command.command, command.args, {
        timeout: Math.max(1, Number(args.timeout ?? 30)) * 1000,
        maxBuffer: 1024 * 1024 * 5,
      });
      return textResult(`${stdout}${stderr}`.slice(0, 10000));
    },

    async fileRead(args = {}) {
      if (!args.path) throw new Error('desktop_file_read requires path');
      const limit = Math.max(1, Number(args.limit ?? 10000));
      const content = await readFile(args.path, 'utf8');
      return textResult(content.slice(0, limit));
    },

    async fileWrite(args = {}) {
      if (!args.path) throw new Error('desktop_file_write requires path');
      await writeFile(args.path, String(args.content ?? ''), 'utf8');
      return textResult(`Wrote ${String(args.content ?? '').length} bytes to ${args.path}`);
    },

    async terminal(args = {}) {
      if (!args.command) throw new Error('desktop_terminal requires command');
      const command = platformShellCommand(platform, args.command);
      const { stdout, stderr } = await runFile(command.command, command.args, {
        timeout: Math.max(1, Number(args.timeout ?? 30)) * 1000,
        maxBuffer: 1024 * 1024 * 5,
      });
      return textResult(`${stdout}${stderr}`.slice(0, 10000));
    },

    async rsLookup(args = {}) {
      const candidates = getDefaultRsToolPaths();
      const rsToolPath = candidates.find((path) => existsSync(path)) ?? null;
      if (!rsToolPath) {
        const searched = candidates.length ? candidates.join(', ') : '(none)';
        throw new Error(
          `RS lookup helper not found. Searched: ${searched}. ` +
            `Set NEWEST_DC_RS_TOOL_PATH to override, or install rs-agent-tools.`,
        );
      }
      const lookupArgs = args.player ? ['player', args.player] : args.clan ? ['clan', args.clan] : null;
      if (!lookupArgs) throw new Error('desktop_rs_lookup requires player or clan');
      const { stdout, stderr } = await runFile(pythonCmd(), [rsToolPath, ...lookupArgs], {
        timeout: 15000,
        maxBuffer: 1024 * 1024 * 3,
      });
      return textResult(`${stdout}${stderr}`.slice(0, 10000));
    },
  };
}
