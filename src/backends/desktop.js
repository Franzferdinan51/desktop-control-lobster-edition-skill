import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageResult, jsonResult, textResult } from '../response.js';
import { runFile, runFileWithInput } from '../process.js';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_ACTION = join(__dirname, '..', '..', 'scripts', 'pyautogui_action.py');

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

function pythonCmd(platform = process.platform) {
  return platform === 'win32' ? 'python' : 'python3';
}

function powershellEscape(value) {
  return String(value).replace(/'/g, "''");
}

function appleScriptEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function commandExists(command, platform = process.platform) {
  const checker = platform === 'win32'
    ? { command: 'where.exe', args: [command] }
    : { command: '/bin/sh', args: ['-lc', `command -v ${command}`] };
  try {
    await runFile(checker.command, checker.args, { timeout: 3000 });
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
    const backgroundArgs = args.foreground === true ? [] : ['-g'];
    if (args.app && !args.path && !args.url) return { command: 'open', args: [...backgroundArgs, '-a', String(args.app)] };
    return { command: 'open', args: [...backgroundArgs, String(target)] };
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
  if (platform === 'linux') return { command: 'wmctrl', args: ['-lGpx'] };
  return null;
}

function platformWindowActivateCommand(platform, args = {}) {
  if (platform === 'win32') {
    const selector = args.pid
      ? `$p = Get-Process -Id ${Number(args.pid)}`
      : `$p = Get-Process | Where-Object {$_.MainWindowTitle -like '*${powershellEscape(args.title)}*'} | Select-Object -First 1`;
    if (!args.pid && !args.title) throw new Error('window_activate requires title or pid');
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-Command', `${selector}; if (!$p) { throw 'window not found' }; Add-Type -Name NativeMethods -Namespace Win32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'; [Win32.NativeMethods]::SetForegroundWindow($p.MainWindowHandle) | Out-Null`],
    };
  }
  if (platform === 'linux') {
    if (!args.title) throw new Error('window_activate on Linux requires title');
    return { command: 'wmctrl', args: ['-a', String(args.title)] };
  }
  return null;
}

function parseLinuxWindows(text) {
  return String(text).split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) return null;
    const [id, desktop, x, y, width, height, pid, wmClass, ...title] = parts;
    return {
      id,
      desktop: Number(desktop),
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height),
      pid: Number(pid),
      class: wmClass,
      title: title.join(' '),
    };
  }).filter(Boolean);
}

async function listNativeWindows(platform) {
  if (platform === 'darwin') {
    const script = `tell application "System Events"
set out to ""
repeat with p in (application processes whose background only is false)
  repeat with w in windows of p
    try
      set {wx, wy} to position of w
      set {ww, wh} to size of w
      set out to out & (unix id of p as text) & tab & (name of p as text) & tab & (name of w as text) & tab & wx & tab & wy & tab & ww & tab & wh & linefeed
    end try
  end repeat
end repeat
return out
end tell`;
    const output = await runAppleScript(script);
    return output.split(/\r?\n/).filter(Boolean).map((line) => {
      const [pid, app, title, x, y, width, height] = line.split('\t');
      return { pid: Number(pid), app, title, x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
    });
  }
  if (platform === 'linux') {
    if (!await commandExists('wmctrl', platform)) throw new Error('wmctrl is required for Linux window management');
    const { stdout } = await runFile('wmctrl', ['-lGpx'], { maxBuffer: 1024 * 1024 * 5 });
    return parseLinuxWindows(stdout);
  }
  if (platform === 'win32') {
    const ps = `$sig='[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect); public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }'; Add-Type -Name NativeMethods -Namespace Win32 -MemberDefinition $sig; Get-Process | Where-Object {$_.MainWindowTitle} | ForEach-Object { $r=New-Object Win32.NativeMethods+RECT; [Win32.NativeMethods]::GetWindowRect($_.MainWindowHandle,[ref]$r)|Out-Null; [pscustomobject]@{pid=$_.Id;app=$_.ProcessName;title=$_.MainWindowTitle;x=$r.Left;y=$r.Top;width=($r.Right-$r.Left);height=($r.Bottom-$r.Top)} } | ConvertTo-Json -Compress`;
    const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-Command', ps], { maxBuffer: 1024 * 1024 * 5 });
    const parsed = stdout.trim() ? JSON.parse(stdout) : [];
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  throw new Error(`window management is not supported on ${platform}`);
}

function findWindow(windows, args = {}) {
  if (args.pid) {
    const byPid = windows.find((w) => Number(w.pid) === Number(args.pid));
    if (byPid) return byPid;
  }
  if (args.title) {
    const needle = String(args.title).toLowerCase();
    const exact = windows.find((w) => String(w.title ?? '').toLowerCase() === needle);
    if (exact) return exact;
    const partial = windows.find((w) => String(w.title ?? '').toLowerCase().includes(needle));
    if (partial) return partial;
    const app = windows.find((w) => String(w.app ?? '').toLowerCase().includes(needle));
    if (app) return app;
  }
  return null;
}

async function requireWindow(platform, args = {}) {
  const windows = await listNativeWindows(platform);
  const found = findWindow(windows, args);
  if (!found) throw new Error(`Window not found: ${args.title ?? args.pid ?? 'active'}`);
  return found;
}

async function macWindowAction(args, body) {
  if (!args.title && !args.pid) throw new Error('window operation requires title or pid');
  const title = appleScriptEscape(args.title ?? '');
  const pidClause = args.pid ? `whose unix id is ${Number(args.pid)}` : '';
  const match = args.title ? `if (name of w as text) contains "${title}" then` : 'if true then';
  const script = `tell application "System Events"
repeat with p in (application processes ${pidClause})
  repeat with w in windows of p
    try
      ${match}
        ${body}
        return "ok"
      end if
    end try
  end repeat
end repeat
error "window not found"
end tell`;
  await runAppleScript(script);
}

async function windowsAction(args, action) {
  if (!args.title && !args.pid) throw new Error('window operation requires title or pid');
  const selector = args.pid
    ? `$p=Get-Process -Id ${Number(args.pid)}`
    : `$p=Get-Process | Where-Object {$_.MainWindowTitle -like '*${powershellEscape(args.title)}*'} | Select-Object -First 1`;
  const sig = `'[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd,int nCmdShow); [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd,int X,int Y,int nWidth,int nHeight,bool bRepaint);'`;
  let command;
  if (action === 'minimize') command = '[Win32.NativeMethods]::ShowWindowAsync($p.MainWindowHandle,6)|Out-Null';
  else if (action === 'maximize') command = '[Win32.NativeMethods]::ShowWindowAsync($p.MainWindowHandle,3)|Out-Null';
  else if (action === 'restore') command = '[Win32.NativeMethods]::ShowWindowAsync($p.MainWindowHandle,9)|Out-Null';
  else if (action === 'close') command = '$p.CloseMainWindow()|Out-Null';
  else if (action === 'move') command = `[Win32.NativeMethods]::MoveWindow($p.MainWindowHandle,${Number(args.x)},${Number(args.y)},${Number(args.width)},${Number(args.height)},$true)|Out-Null`;
  else throw new Error(`unknown Windows window action: ${action}`);
  const ps = `${selector}; if (!$p) { throw 'window not found' }; Add-Type -Name NativeMethods -Namespace Win32 -MemberDefinition ${sig}; ${command}`;
  await runFile('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: 15000 });
}

export function createDesktopBackend(options = {}) {
  const platform = options.platform ?? process.platform;

  async function manipulateWindow(action, args = {}) {
    const current = await requireWindow(platform, args);
    if (platform === 'darwin') {
      if (action === 'minimize') await macWindowAction(args, 'set value of attribute "AXMinimized" of w to true');
      else if (action === 'restore') await macWindowAction(args, 'set value of attribute "AXMinimized" of w to false');
      else if (action === 'maximize') {
        const size = await runPython('screen_size');
        await macWindowAction(args, `set value of attribute "AXMinimized" of w to false\nset position of w to {0, 0}\nset size of w to {${Number(size.width)}, ${Number(size.height)}}`);
      } else if (action === 'close') await macWindowAction(args, 'perform action "AXPress" of (first button of w whose subrole is "AXCloseButton")');
      else if (action === 'move') await macWindowAction(args, `set position of w to {${Number(args.x)}, ${Number(args.y)}}`);
      else if (action === 'resize') await macWindowAction(args, `set size of w to {${Number(args.width)}, ${Number(args.height)}}`);
    } else if (platform === 'linux') {
      const title = current.title;
      if (action === 'minimize') await runFile('wmctrl', ['-r', title, '-b', 'add,hidden']);
      else if (action === 'restore') await runFile('wmctrl', ['-r', title, '-b', 'remove,hidden,maximized_vert,maximized_horz']);
      else if (action === 'maximize') await runFile('wmctrl', ['-r', title, '-b', 'add,maximized_vert,maximized_horz']);
      else if (action === 'close') await runFile('wmctrl', ['-c', title]);
      else if (action === 'move') await runFile('wmctrl', ['-r', title, '-e', `0,${Number(args.x)},${Number(args.y)},${current.width},${current.height}`]);
      else if (action === 'resize') await runFile('wmctrl', ['-r', title, '-e', `0,${current.x},${current.y},${Number(args.width)},${Number(args.height)}`]);
    } else if (platform === 'win32') {
      if (action === 'move') await windowsAction({ ...args, width: current.width, height: current.height }, 'move');
      else if (action === 'resize') await windowsAction({ ...args, x: current.x, y: current.y }, 'move');
      else await windowsAction(args, action);
    } else {
      throw new Error(`window operation is not supported on ${platform}`);
    }
    return current;
  }

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
        checks.windowManagement = checks.osascript;
      } else if (platform === 'linux') {
        checks.xdgOpen = await commandExists('xdg-open', platform);
        checks.wmctrl = await commandExists('wmctrl', platform);
        checks.windowManagement = checks.wmctrl;
        checks.clipboard = Boolean(await firstAvailable(platformClipboardReadCandidates(platform), platform));
      } else if (platform === 'win32') {
        checks.powershell = await commandExists('powershell.exe', platform);
        checks.cmd = await commandExists('cmd.exe', platform);
        checks.windowManagement = checks.powershell;
      }
      return { available: true, detail: checks };
    },

    async screenshot(args = {}) {
      if (platform === 'darwin') {
        const captureDirectory = await mkdtemp(join(tmpdir(), 'newest-desktop-control-'));
        const capturePath = join(captureDirectory, 'screenshot.png');
        const commandArgs = ['-x', '-t', 'png'];
        if (args.region) commandArgs.push('-R', args.region.join(','));
        commandArgs.push(capturePath);
        try {
          await runFile('screencapture', commandArgs, { timeout: 30000 });
          const image = await readFile(capturePath);
          if (!image.length) throw new Error('screencapture returned an empty image.');
          return imageResult(image.toString('base64'));
        } finally {
          await rm(captureDirectory, { recursive: true, force: true });
        }
      }
      const result = await runPython('screenshot', args);
      return imageResult(result.image);
    },

    async mouseMove(args = {}) { await runPython('mouse_move', args); return textResult(`Moved desktop mouse to (${args.x}, ${args.y})`); },
    async mouseClick(args = {}) { await runPython('mouse_click', args); return textResult('Clicked desktop mouse'); },
    async mouseScroll(args = {}) { const amount = args.amount ?? args.clicks ?? args.delta_y ?? -3; await runPython('mouse_scroll', { ...args, amount }); return textResult(`Scrolled desktop by ${amount}`); },
    async mouseDrag(args = {}) { await runPython('mouse_drag', args); return textResult(`Dragged mouse to (${args.x}, ${args.y})`); },
    async mouseDoubleClick(args = {}) { await runPython('mouse_double_click', args); return textResult('Double-clicked desktop mouse'); },
    async keyDown(args = {}) { await runPython('key_down', args); return textResult(`Key down: ${args.key}`); },
    async keyUp(args = {}) { await runPython('key_up', args); return textResult(`Key up: ${args.key}`); },
    async getActiveWindow() { return jsonResult(await runPython('get_active_window')); },
    async findImage(args = {}) { return jsonResult(await runPython('find_image', args)); },
    async scrollDirection(args = {}) { await runPython('scroll_direction', args); return textResult(`Scrolled ${args.direction || 'down'}`); },
    async ocr(args = {}) { const result = await runPython('ocr', args); return result.error ? textResult(`OCR error: ${result.error}`) : jsonResult({ text: result.text || '', error: result.error }); },
    async wait(args = {}) { await runPython('wait', args); return textResult(`Waited ${args.seconds || 1} seconds`); },

    async getAllWindows() { return jsonResult({ windows: await listNativeWindows(platform) }); },
    async minimizeWindow(args = {}) { await manipulateWindow('minimize', args); return textResult(`Minimized window: ${args.title || args.pid}`); },
    async maximizeWindow(args = {}) { await manipulateWindow('maximize', args); return textResult(`Maximized window: ${args.title || args.pid}`); },
    async restoreWindow(args = {}) { await manipulateWindow('restore', args); return textResult(`Restored window: ${args.title || args.pid}`); },
    async closeWindow(args = {}) { await manipulateWindow('close', args); return textResult(`Closed window: ${args.title || args.pid}`); },
    async mouseHover(args = {}) { await runPython('mouse_hover', args); return textResult(`Hovered mouse at (${args.x}, ${args.y})`); },
    async rightClick(args = {}) { await runPython('right_click', args); const where = args.x !== undefined && args.y !== undefined ? ` at (${args.x}, ${args.y})` : ''; return textResult(`Right-clicked${where}`); },
    async middleClick(args = {}) { await runPython('middle_click', args); const where = args.x !== undefined && args.y !== undefined ? ` at (${args.x}, ${args.y})` : ''; return textResult(`Middle-clicked${where}`); },

    async focusWindow(args = {}) {
      if (!args.title && !args.pid) throw new Error('desktop_focus_window requires title or pid');
      return this.windowActivate(args);
    },

    async screenshotWindow(args = {}) {
      if (!args.title && !args.pid) throw new Error('desktop_screenshot_window requires title or pid');
      const info = await requireWindow(platform, args);
      const result = await runPython('screenshot', { region: [info.x, info.y, info.width, info.height] });
      if (!result.image) throw new Error(`Unable to capture window: ${info.title}`);
      return imageResult(result.image);
    },

    async getWindowInfo(args = {}) {
      if (!args.title && !args.pid) throw new Error('desktop_get_window_info requires title or pid');
      return jsonResult({ found: true, ...(await requireWindow(platform, args)) });
    },

    async waitForImage(args = {}) { if (!args.image_path) throw new Error('desktop_wait_for_image requires image_path'); return jsonResult(await runPython('wait_for_image', args)); },
    async moveWindow(args = {}) { if (!Number.isFinite(Number(args.x)) || !Number.isFinite(Number(args.y))) throw new Error('desktop_move_window requires x and y'); await manipulateWindow('move', args); return textResult(`Moved window: ${args.title || args.pid} to (${args.x}, ${args.y})`); },
    async resizeWindow(args = {}) { if (!Number.isFinite(Number(args.width)) || !Number.isFinite(Number(args.height))) throw new Error('desktop_resize_window requires width and height'); await manipulateWindow('resize', args); return textResult(`Resized window: ${args.title || args.pid} to ${args.width}x${args.height}`); },
    async getMonitors() { return jsonResult(await runPython('get_monitors')); },
    async listProcesses() { return jsonResult(await runPython('list_processes')); },
    async killProcess(args = {}) { await runPython('kill_process', args); return textResult(`Killed process ${args.pid}`); },
    async keyboardType(args = {}) { await runPython('keyboard_type', args); return textResult(`Typed ${String(args.text ?? '').length} characters on desktop`); },
    async keyboardPress(args = {}) { const presses = Math.max(1, Number(args.presses ?? 1)); for (let i = 0; i < presses; i += 1) await runPython('keyboard_press', { ...args, presses: 1 }); return textResult(`Pressed desktop key ${args.key} ${presses} time(s)`); },
    async keyboardHotkey(args = {}) { await runPython('keyboard_hotkey', args); return textResult(`Pressed desktop hotkey ${args.keys.join('+')}`); },
    async keyboard(args = {}) { if (args.text) return this.keyboardType(args); const key = args.key ?? args.press; if (key) return this.keyboardPress({ ...args, key }); throw new Error('desktop_keyboard requires text, key, or press'); },
    async cursorPosition() { return jsonResult(await runPython('cursor_position')); },
    async getScreenSize() { return jsonResult(await runPython('screen_size')); },
    async getPixelColor(args = {}) { return jsonResult(await runPython('pixel_color', args)); },

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
      await runFile(command.command, command.args, { timeout: 5000 });
      const mode = platform === 'darwin' && args.foreground !== true ? ' in the background' : '';
      return textResult(`Launched ${args.url ?? args.path ?? args.app}${mode}`);
    },

    async windowList() { return jsonResult({ windows: await listNativeWindows(platform) }); },

    async windowActivate(args = {}) {
      if (platform !== 'darwin') {
        const command = platformWindowActivateCommand(platform, args);
        if (!command) throw new Error(`window_activate is not supported on ${platform}`);
        await runFile(command.command, command.args);
        return textResult(`Activated ${args.pid ?? args.title}`);
      }
      const info = await requireWindow(platform, args);
      await runAppleScript(`tell application "System Events" to set frontmost of first process whose unix id is ${Number(info.pid)} to true`);
      return textResult(`Activated ${info.title}`);
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
      const { stdout, stderr } = await runFile(command.command, command.args, { timeout: Math.max(1, Number(args.timeout ?? 30)) * 1000, maxBuffer: 1024 * 1024 * 5 });
      return textResult(`${stdout}${stderr}`.slice(0, 10000));
    },

    async fileRead(args = {}) { if (!args.path) throw new Error('desktop_file_read requires path'); const limit = Math.max(1, Number(args.limit ?? 10000)); const content = await readFile(args.path, 'utf8'); return textResult(content.slice(0, limit)); },
    async fileWrite(args = {}) { if (!args.path) throw new Error('desktop_file_write requires path'); await writeFile(args.path, String(args.content ?? ''), 'utf8'); return textResult(`Wrote ${String(args.content ?? '').length} bytes to ${args.path}`); },

    async terminal(args = {}) {
      if (!args.command) throw new Error('desktop_terminal requires command');
      const command = platformShellCommand(platform, args.command);
      const { stdout, stderr } = await runFile(command.command, command.args, { timeout: Math.max(1, Number(args.timeout ?? 30)) * 1000, maxBuffer: 1024 * 1024 * 5 });
      return textResult(`${stdout}${stderr}`.slice(0, 10000));
    },

    async rsLookup(args = {}) {
      const candidates = getDefaultRsToolPaths();
      const rsToolPath = candidates.find((path) => existsSync(path)) ?? null;
      if (!rsToolPath) throw new Error(`RS lookup helper not found. Searched: ${candidates.join(', ') || '(none)'}. Set NEWEST_DC_RS_TOOL_PATH to override, or install rs-agent-tools.`);
      const lookupArgs = args.player ? ['player', args.player] : args.clan ? ['clan', args.clan] : null;
      if (!lookupArgs) throw new Error('desktop_rs_lookup requires player or clan');
      const { stdout, stderr } = await runFile(pythonCmd(), [rsToolPath, ...lookupArgs], { timeout: 15000, maxBuffer: 1024 * 1024 * 3 });
      return textResult(`${stdout}${stderr}`.slice(0, 10000));
    },
  };
}
