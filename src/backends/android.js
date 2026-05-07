import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { imageResult, jsonResult, textResult } from '../response.js';

const execFileAsync = promisify(execFile);

export function buildAdbArgs(options = {}, command = []) {
  const args = [];
  if (options.device) args.push('-s', String(options.device));
  args.push(...command.map(String));
  return args;
}

export function escapeInputText(text) {
  return String(text).replace(/ /g, '%s');
}

export function parseScreenSize(output) {
  const match = String(output).match(/Physical size:\s*(\d+)x(\d+)/);
  if (!match) throw new Error('Unable to parse Android screen size');
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function parseCurrentActivity(output) {
  const text = String(output);
  const match = text.match(/(?:mCurrentFocus|mFocusedApp)=.*?\s([A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+)/);
  if (!match) return { raw: null, package: null, activity: null };
  const raw = match[1];
  const slash = raw.indexOf('/');
  return {
    raw,
    package: raw.slice(0, slash),
    activity: raw.slice(slash + 1),
  };
}

async function runAdb(options, command, execOptions = {}) {
  const { stdout, stderr } = await execFileAsync('adb', buildAdbArgs(options, command), {
    timeout: execOptions.timeout ?? 30000,
    maxBuffer: execOptions.maxBuffer ?? 1024 * 1024 * 20,
    encoding: execOptions.encoding ?? 'utf8',
  });
  return { stdout, stderr };
}

export function createAndroidBackend() {
  return {
    async status() {
      try {
        const { stdout } = await runAdb({}, ['version']);
        return { available: true, detail: stdout.trim().split('\n')[0] };
      } catch (error) {
        return { available: false, detail: error.message };
      }
    },

    async devices() {
      const { stdout } = await runAdb({}, ['devices', '-l']);
      const devices = stdout
        .split('\n')
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [id, state, ...details] = line.split(/\s+/);
          return { id, state, details: details.join(' ') };
        });
      return jsonResult({ devices });
    },

    async screenshot(args = {}) {
      const { stdout } = await runAdb(args, ['exec-out', 'screencap', '-p'], {
        encoding: 'buffer',
        maxBuffer: 1024 * 1024 * 30,
      });
      return imageResult(Buffer.from(stdout).toString('base64'));
    },

    async screenSize(args = {}) {
      const { stdout } = await runAdb(args, ['shell', 'wm', 'size']);
      return jsonResult(parseScreenSize(stdout));
    },

    async currentActivity(args = {}) {
      const { stdout } = await runAdb(args, ['shell', 'dumpsys', 'window'], { maxBuffer: 1024 * 1024 * 10 });
      return jsonResult(parseCurrentActivity(stdout));
    },

    async tap(args = {}) {
      await runAdb(args, ['shell', 'input', 'tap', args.x, args.y]);
      return textResult(`Tapped Android device at (${args.x}, ${args.y})`);
    },

    async swipe(args = {}) {
      await runAdb(args, [
        'shell',
        'input',
        'swipe',
        args.x1,
        args.y1,
        args.x2,
        args.y2,
        args.duration ?? 300,
      ]);
      return textResult(`Swiped Android device from (${args.x1}, ${args.y1}) to (${args.x2}, ${args.y2})`);
    },

    async text(args = {}) {
      await runAdb(args, ['shell', 'input', 'text', escapeInputText(args.text ?? '')]);
      return textResult(`Typed ${String(args.text ?? '').length} characters on Android device`);
    },

    async key(args = {}) {
      await runAdb(args, ['shell', 'input', 'keyevent', args.key]);
      return textResult(`Sent Android key event ${args.key}`);
    },

    async launchApp(args = {}) {
      await runAdb(args, ['shell', 'monkey', '-p', args.package, '-c', 'android.intent.category.LAUNCHER', '1']);
      return textResult(`Launched Android package ${args.package}`);
    },

    async uiDump(args = {}) {
      const dumpPath = '/sdcard/window_dump.xml';
      await runAdb(args, ['shell', 'uiautomator', 'dump', dumpPath]);
      const { stdout } = await runAdb(args, ['shell', 'cat', dumpPath], { maxBuffer: 1024 * 1024 * 10 });
      return textResult(stdout);
    },

    async logcat(args = {}) {
      const lines = Math.max(1, Math.min(Number(args.lines ?? 200), 2000));
      const { stdout } = await runAdb(args, ['logcat', '-d', '-t', lines], { maxBuffer: 1024 * 1024 * 20 });
      return textResult(stdout);
    },
  };
}
