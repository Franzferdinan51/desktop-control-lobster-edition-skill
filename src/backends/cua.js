/**
 * cua.js — Computer-Use Agent (CUA) backend that wraps trycua/cua-driver.
 *
 * Why a separate backend?
 *   The default desktop backend (pyautogui) drives the REAL cursor and steals
 *   keyboard focus. Hermes Agent's CUA mode uses platform accessibility APIs
 *   (AX on macOS, UIA on Windows, AT-SPI2 on Linux) so:
 *     - the user's real cursor never moves
 *     - keyboard focus stays with the user
 *     - we can run alongside them, not in place of them
 *
 * Install cua-driver:
 *     /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"
 *
 * On first run, macOS will prompt for Accessibility + Screen Recording permissions
 * (must be granted to /Applications/CuaDriver.app, NOT the terminal).
 *
 * Env vars:
 *   NEWEST_DC_CUA_DRIVER  - absolute path to cua-driver binary (default ~/.local/bin/cua-driver)
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { runFile, runFileWithInput } from '../process.js';
import { imageResult, jsonResult, textResult } from '../response.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_ACTION = join(__dirname, '..', '..', 'scripts', 'cua_action.py');

export function getDefaultCuaDriverPaths() {
  return [
    process.env.NEWEST_DC_CUA_DRIVER,
    join(homedir(), '.local', 'bin', 'cua-driver'),
    '/opt/homebrew/bin/cua-driver',
    '/usr/local/bin/cua-driver',
  ].filter(Boolean);
}

export function resolveCuaDriverPath() {
  return getDefaultCuaDriverPaths().find((p) => existsSync(p)) ?? null;
}

function pythonCmd(platform = process.platform) {
  return platform === 'win32' ? 'python' : 'python3';
}

async function runCuaAction(action, args = {}) {
  const cuaPath = resolveCuaDriverPath();
  if (!cuaPath) {
    const searched = getDefaultCuaDriverPaths().join(', ') || '(none)';
    throw new Error(
      `cua-driver not found. Searched: ${searched}. ` +
        `Install with: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"`,
    );
  }
  if (!existsSync(PY_ACTION)) {
    throw new Error(`cua_action.py not found at ${PY_ACTION}`);
  }
  const payload = JSON.stringify({ action, args });
  const { stdout } = await runFileWithInput(pythonCmd(), [PY_ACTION], payload, {
    timeout: 30000,
    env: { ...process.env, NEWEST_DC_CUA_DRIVER: cuaPath },
  });
  const text = stdout.toString('utf8').trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed;
}

export const HARD_BLOCKED_ACTIONS = new Set([
  'kill_pid_1',
  'kill_pid_kernel_task',
  'kill_pid_windowserver',
  'kill_pid_loginwindow',
  'kill_pid_launchd',
]);

export function killAppProtectionReason(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return 'invalid_pid';
  if (pid === 1) return HARD_BLOCKED_ACTIONS.has('kill_pid_1') ? 'pid_1_init' : null;
  if (pid < 50) return 'reserved_system_pid';
  return null;
}

export function evictOldScreenshots(history = [], opts = {}) {
  const keepN = Math.max(1, Number(opts.keep_last_n ?? 5));
  const sorted = [...history].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  const kept = sorted.slice(-keepN);
  const evicted = sorted.slice(0, -keepN);
  let summary = null;
  if (evicted.length && typeof opts.summarize === 'function') {
    try {
      summary = opts.summarize(evicted);
    } catch {
      summary = `(${evicted.length} older screenshots evicted)`;
    }
  } else if (evicted.length) {
    summary = `(${evicted.length} older screenshots evicted — keep_last_n=${keepN})`;
  }
  return { kept, evicted, summary };
}

const PROMPT_INJECTION_PATTERNS = [
  /\bignore (?:all )?(?:previous|prior|above) (?:instructions|prompts?|directions?)\b/i,
  /\byou are now\b/i,
  /\bsystem:\s*[^\n]+/i,
  /\b(?:disregard|forget) (?:everything|all) (?:above|before|prior)\b/i,
  /\bnew instructions?\s*:\s*[^\n]+/i,
  /\b(?:click|tap|press|run|execute)\b[^\n]{0,40}\b(?:immediately|now|urgent|critical)\b/i,
  /<\s*\|(?:im_start|system|admin)\|>/i,
];

export function scanForPromptInjection(text = '') {
  if (!text) return { safe: true, reasons: [] };
  const reasons = [];
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) reasons.push(`matched: ${pattern.source.slice(0, 60)}`);
  }
  return { safe: reasons.length === 0, reasons };
}

export function createCuaBackend(options = {}) {
  const platform = options.platform ?? process.platform;

  return {
    name: 'cua',
    kind: 'cua',

    async status() {
      const cuaPath = resolveCuaDriverPath();
      const detail = {
        platform,
        cua_driver_path: cuaPath,
        cua_driver_installed: Boolean(cuaPath),
        python_script: PY_ACTION,
        python_script_present: existsSync(PY_ACTION),
      };
      if (!cuaPath) {
        return {
          available: false,
          detail: {
            ...detail,
            install_hint:
              '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"',
          },
        };
      }
      try {
        const screen = await runCuaAction('screen_size');
        detail.screen_size = { width: screen.width, height: screen.height, scale_factor: screen.scale_factor };
        detail.working = true;
        return { available: true, detail };
      } catch (error) {
        return { available: false, detail: { ...detail, working: false, error: error.message } };
      }
    },

    async axTree(args = {}) {
      return jsonResult(await runCuaAction('ax_tree', args));
    },

    async listApps(args = {}) {
      return jsonResult(await runCuaAction('list_apps', args));
    },

    async focusApp(args = {}) {
      return jsonResult(await runCuaAction('focus_app', args));
    },

    async launchApp(args = {}) {
      return jsonResult(await runCuaAction('launch_app', args));
    },

    async somCapture(args = {}) {
      const result = await runCuaAction('som_capture', args);
      return {
        ...jsonResult({
          title: result.title,
          count: result.count,
          window_id: result.window_id,
          elements: result.elements,
          tree_markdown: result.tree_markdown,
        }),
        _image: result.image,
      };
    },

    async clickElement(args = {}) {
      return jsonResult(await runCuaAction('click_element', args));
    },

    async dragElement(args = {}) {
      return jsonResult(await runCuaAction('drag_element', args));
    },

    async typeInto(args = {}) {
      return jsonResult(await runCuaAction('type_into', args));
    },

    async keyCombo(args = {}) {
      return jsonResult(await runCuaAction('key_combo', args));
    },

    async killApp(args = {}) {
      const pid = Number(args.pid);
      const protection = killAppProtectionReason(pid);
      if (protection) {
        throw new Error(`kill_app blocked: ${protection} (pid=${pid})`);
      }
      const cuaPath = resolveCuaDriverPath();
      if (!cuaPath) throw new Error('cua-driver not installed');
      const { stdout } = await runFile(cuaPath, ['call', 'kill_app', JSON.stringify({ pid })], {
        timeout: 10000,
      });
      const text = stdout.toString('utf8').trim();
      return textResult(text || `kill_app pid=${pid} sent`);
    },

    async screenshotPromptGuard(args = {}) {
      if (args.text) {
        const result = scanForPromptInjection(args.text);
        return jsonResult({ ...result, source: 'text', ocr_text: args.text.slice(0, 2000) });
      }
      const cuaPath = resolveCuaDriverPath();
      if (!cuaPath) throw new Error('cua-driver not installed — install it to use screenshot_prompt_guard');
      const ssResult = await runCuaAction('screenshot', {});
      if (!ssResult.image) throw new Error('screenshot capture returned no data');
      return jsonResult({
        safe: null,
        reasons: ['screenshot_not_scanned_without_ocr_text'],
        source: 'screenshot',
        ocr_text: null,
        note: 'Screenshot captured, but no OCR text was available. Pass text= to perform the prompt-injection scan.',
      });
    },

    async screenshot() {
      const result = await runCuaAction('screenshot', {});
      return imageResult(result.image);
    },

    async screenshotWindow(args = {}) {
      const result = await runCuaAction('screenshot_window', args);
      if (!result.image) return textResult(`Window not found: pid=${args.pid}`);
      return imageResult(result.image);
    },

    async axTreeOnly(args = {}) {
      const full = await runCuaAction('ax_tree', args);
      return jsonResult({
        apps: full.apps,
        window: full.window
          ? { pid: full.window.pid, window_id: full.window.window_id, title: full.window.title, elements: full.window.elements }
          : null,
      });
    },

    async cursorPosition() {
      return jsonResult(await runCuaAction('cursor_position'));
    },

    async screenSize() {
      return jsonResult(await runCuaAction('screen_size'));
    },

    async getActiveWindow() {
      return jsonResult(await runCuaAction('get_active_window'));
    },
  };
}
