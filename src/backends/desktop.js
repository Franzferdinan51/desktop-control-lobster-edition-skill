import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageResult, jsonResult, textResult } from '../response.js';
import { runFile, runFileWithInput } from '../process.js';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_ACTION = join(__dirname, '..', '..', 'scripts', 'pyautogui_action.py');
const RS_TOOL_PATH = '/Users/duckets/Desktop/rs-agent-tools/mcp-launcher.py';

async function runPython(action, args = {}) {
  const payload = JSON.stringify({ action, args });
  const { stdout } = await runFileWithInput('python3', [PY_ACTION], payload, { timeout: 30000 });
  const text = stdout.toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

async function runAppleScript(script) {
  const { stdout } = await runFile('osascript', ['-e', script], { timeout: 15000 });
  return stdout.trim();
}

export function createDesktopBackend() {
  return {
    async status() {
      const checks = {};
      try {
        await runFile('python3', ['--version']);
        checks.python3 = true;
        try {
          await runFile('python3', ['-c', 'import pyautogui, PIL']);
          checks.pyautogui = true;
        } catch (error) {
          checks.pyautogui = false;
          checks.pyautoguiError = error.message;
        }
      } catch (error) {
        checks.python3 = false;
        checks.pythonError = error.message;
      }
      if (process.platform === 'darwin') {
        checks.screencapture = true;
        checks.pbcopy = true;
        checks.osascript = true;
      }
      return { available: true, detail: checks };
    },

    async screenshot(args = {}) {
      if (process.platform === 'darwin') {
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
      if (process.platform === 'darwin') {
        const { stdout } = await runFile('pbpaste', []);
        return textResult(stdout);
      }
      throw new Error('clipboard_read fallback requires macOS pbpaste in this version');
    },

    async clipboardWrite(args = {}) {
      if (process.platform === 'darwin') {
        await runFileWithInput('pbcopy', [], args.text ?? '');
        return textResult(`Copied ${String(args.text ?? '').length} characters to desktop clipboard`);
      }
      throw new Error('clipboard_write fallback requires macOS pbcopy in this version');
    },

    async launchApp(args = {}) {
      if (process.platform !== 'darwin') throw new Error('desktop_launch_app currently requires macOS');
      if (args.url) {
        await runFile('open', [String(args.url)]);
        return textResult(`Opened URL ${args.url}`);
      }
      if (args.path) {
        await runFile('open', [String(args.path)]);
        return textResult(`Opened app path ${args.path}`);
      }
      if (args.app) {
        await runFile('open', ['-a', String(args.app)]);
        return textResult(`Launched app ${args.app}`);
      }
      throw new Error('desktop_launch_app requires app, path, or url');
    },

    async windowList() {
      if (process.platform !== 'darwin') throw new Error('window_list currently requires macOS');
      const script = 'tell application "System Events" to get name of every process whose background only is false';
      const output = await runAppleScript(script);
      const apps = output ? output.split(', ').filter(Boolean) : [];
      return jsonResult({ apps });
    },

    async windowActivate(args = {}) {
      if (process.platform !== 'darwin') throw new Error('window_activate currently requires macOS');
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
      const command = String(args.path).endsWith('.py') ? 'python3' : 'bash';
      const { stdout, stderr } = await runFile(command, [args.path], {
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
      const { stdout, stderr } = await runFile('/bin/bash', ['-lc', args.command], {
        timeout: Math.max(1, Number(args.timeout ?? 30)) * 1000,
        maxBuffer: 1024 * 1024 * 5,
      });
      return textResult(`${stdout}${stderr}`.slice(0, 10000));
    },

    async rsLookup(args = {}) {
      if (!existsSync(RS_TOOL_PATH)) throw new Error(`RS lookup helper not found: ${RS_TOOL_PATH}`);
      const lookupArgs = args.player ? ['player', args.player] : args.clan ? ['clan', args.clan] : null;
      if (!lookupArgs) throw new Error('desktop_rs_lookup requires player or clan');
      const { stdout, stderr } = await runFile('python3', [RS_TOOL_PATH, ...lookupArgs], {
        timeout: 15000,
        maxBuffer: 1024 * 1024 * 3,
      });
      return textResult(`${stdout}${stderr}`.slice(0, 10000));
    },
  };
}
