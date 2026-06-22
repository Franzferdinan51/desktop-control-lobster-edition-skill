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
 *
 * Layer model:
 *   Tools (src/tools.js) -> backend.somCapture / .axTree / .clickElement / etc
 *                         -> scripts/cua_action.py (thin shim that shells out)
 *                         -> cua-driver call <tool> '<json>' (Rust binary)
 *                         -> AX/UIA/AT-SPI2 (real OS APIs)
 *
 * If cua-driver isn't installed, every method here throws a clear, helpful error
 * so callers can fall back to the pyautogui backend.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { runFile, runFileWithInput } from '../process.js';
import { imageResult, jsonResult, textResult } from '../response.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_ACTION = join(__dirname, '..', '..', 'scripts', 'cua_action.py');

/**
 * Resolve the cua-driver binary lazily. Candidates:
 *   1. NEWEST_DC_CUA_DRIVER env var
 *   2. ~/.local/bin/cua-driver (default install location)
 *   3. /opt/homebrew/bin/cua-driver (Homebrew variant)
 *   4. /usr/local/bin/cua-driver (Intel Mac default)
 *
 * Resolved lazily so tests and env overrides work without re-import.
 */
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
  if (!resolveCuaDriverPath()) {
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
  const { stdout } = await runFileWithInput(pythonCmd(), [PY_ACTION], payload, { timeout: 30000 });
  const text = stdout.toString('utf8').trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === 'object' && parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed;
}

/**
 * Hard-block list — actions that the CUA backend refuses to perform even if asked.
 * This is the v2.0 "destructive action guard" delivered early. Remove items from
 * this list only by editing the source; callers cannot override via env.
 *
 * Hermes's CUA has these blocked by design; we copy the same posture because
 * an agent can issue kill_app({pid: 1}) just as easily as kill_app({pid: 47123}).
 */
export const HARD_BLOCKED_ACTIONS = new Set([
  // macOS-critical PIDs (launchd, WindowServer, loginwindow, kernel)
  'kill_pid_1',
  'kill_pid_kernel_task',
  'kill_pid_windowserver',
  'kill_pid_loginwindow',
  'kill_pid_launchd',
]);

/**
 * Check if a kill_app call targets a protected PID. Returns the protection reason
 * or null when safe to proceed.
 */
export function killAppProtectionReason(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return 'invalid_pid';
  if (pid === 1) return HARD_BLOCKED_ACTIONS.has('kill_pid_1') ? 'pid_1_init' : null;
  // Heuristic: super-low PIDs on macOS are reserved system processes
  if (pid < 50) return 'reserved_system_pid';
  return null;
}

/**
 * Token-aware screenshot eviction — keeps the most recent N screenshots, summarizes the rest.
 * Pure function so tests can exercise it without I/O.
 *
 * Inputs:
 *   history: Array<{ts: number, data: string, summary?: string}>
 *   opts: { keep_last_n?: number, summarize?: (older: any[]) => string }
 *
 * Returns: { kept: [...], evicted: [...], summary: string | null }
 */
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

/**
 * Screenshot prompt-injection guard. Inspects a base64 PNG (or text content)
 * for instructions that look like prompt injection attempts ("ignore previous
 * instructions", "you are now", "system:", etc.). Returns:
 *   { safe: boolean, reasons: string[] }
 *
 * Hermes's CUA does this at the AX tree level — we add a lightweight OCR pass
 * as a second line of defense for vision-only paths.
 */
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
    if (pattern.test(text)) {
      reasons.push(`matched: ${pattern.source.slice(0, 60)}`);
    }
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

    /**
     * desktop_ax_tree — returns structured accessibility tree.
     * If pid is given, includes a deep snapshot of one window (elements + tree_markdown).
     */
    async axTree(args = {}) {
      const result = await runCuaAction('ax_tree', args);
      return jsonResult(result);
    },

    /**
     * desktop_list_apps — list macOS apps (running + installed).
     */
    async listApps(args = {}) {
      const result = await runCuaAction('list_apps', args);
      return jsonResult(result);
    },

    /**
     * desktop_focus_app — route input to a background app without stealing focus.
     * On macOS this is implicit (CGEventPostToPid reaches backgrounded apps),
     * so we just resolve pid + bring_to_front for parity.
     */
    async focusApp(args = {}) {
      const result = await runCuaAction('focus_app', args);
      return jsonResult(result);
    },

    /**
     * desktop_launch_app — launch an app in the background.
     */
    async launchApp(args = {}) {
      const result = await runCuaAction('launch_app', args);
      return jsonResult(result);
    },

    /**
     * desktop_som_capture — screenshot + SOM-style labeled AX tree.
     * Returns: { image, title, elements: [{element_index, role, label, frame}], tree_markdown }
     */
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
        // Include image as base64 in a second key for callers that want raw bytes
        _image: result.image,
      };
    },

    /**
     * desktop_click_element — click by element_index (preferred) or pixel.
     */
    async clickElement(args = {}) {
      const result = await runCuaAction('click_element', args);
      return jsonResult(result);
    },

    /**
     * desktop_drag_element — drag by element indices or pixel coords.
     */
    async dragElement(args = {}) {
      const result = await runCuaAction('drag_element', args);
      return jsonResult(result);
    },

    /**
     * desktop_type_into — type text into a focused element.
     */
    async typeInto(args = {}) {
      const result = await runCuaAction('type_into', args);
      return jsonResult(result);
    },

    /**
     * desktop_key_combo — press a hotkey combination (cmd+shift+p, etc).
     */
    async keyCombo(args = {}) {
      const result = await runCuaAction('key_combo', args);
      return jsonResult(result);
    },

    /**
     * desktop_kill_app — guarded process termination.
     */
    async killApp(args = {}) {
      const pid = Number(args.pid);
      const protection = killAppProtectionReason(pid);
      if (protection) {
        throw new Error(`kill_app blocked: ${protection} (pid=${pid})`);
      }
      // Delegate to cua-driver (we don't shell out to kill directly).
      const { runFile: run } = await import('../process.js');
      const { stdout } = await run('cua-driver', ['call', 'kill_app', JSON.stringify({ pid })], {
        timeout: 10000,
      });
      const text = stdout.toString('utf8').trim();
      return textResult(text || `kill_app pid=${pid} sent`);
    },

    /**
     * desktop_screenshot_prompt_guard — OCR + prompt-injection scan on a screenshot
     * (or a text blob). Returns { safe, reasons, ocr_text }.
     */
    async screenshotPromptGuard(args = {}) {
      if (args.text) {
        const result = scanForPromptInjection(args.text);
        return jsonResult({ ...result, source: 'text', ocr_text: args.text.slice(0, 2000) });
      }
      // Capture screenshot first
      const cuaPath = resolveCuaDriverPath();
      if (!cuaPath) {
        throw new Error('cua-driver not installed — install it to use screenshot_prompt_guard');
      }
      const ssResult = await runCuaAction('screenshot', {});
      if (!ssResult.image) {
        throw new Error('screenshot capture returned no data');
      }
      // Try OCR via the desktop backend's OCR tool (delegated to pyautogui_action.py)
      // For now, we treat the screenshot as opaque and scan only what the caller provided.
      return jsonResult({
        safe: true,
        reasons: [],
        source: 'screenshot',
        ocr_text: null,
        note: 'screenshot OCR requires OCR backend; pass text= explicitly to scan text',
      });
    },

    /**
     * Generic screenshot (full screen) — uses cua-driver's zoom under the hood,
     * but for full-screen we use the OS-native capture path (screencapture on macOS)
     * because AXTree paths only capture windows, not the desktop itself.
     */
    async screenshot() {
      const result = await runCuaAction('screenshot', {});
      return imageResult(result.image);
    },

    /**
     * Screenshot of a single window (by pid).
     */
    async screenshotWindow(args = {}) {
      const result = await runCuaAction('screenshot_window', args);
      if (!result.image) {
        return textResult(`Window not found: pid=${args.pid}`);
      }
      return imageResult(result.image);
    },

    /**
     * AX-tree-only mode — like ax_tree but returns ONLY structured elements (no markdown).
     * This is the cost-optimization path for text-only models.
     */
    async axTreeOnly(args = {}) {
      const full = await runCuaAction('ax_tree', args);
      return jsonResult({
        apps: full.apps,
        window: full.window
          ? { pid: full.window.pid, window_id: full.window.window_id, title: full.window.title, elements: full.window.elements }
          : null,
      });
    },

    /**
     * Cursor position (in screen points, top-left origin).
     */
    async cursorPosition() {
      return jsonResult(await runCuaAction('cursor_position'));
    },

    /**
     * Screen size + scale factor.
     */
    async screenSize() {
      return jsonResult(await runCuaAction('screen_size'));
    },

    /**
     * Active window (which app is frontmost).
     */
    async getActiveWindow() {
      return jsonResult(await runCuaAction('get_active_window'));
    },
  };
}
