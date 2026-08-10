import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoUrl = new URL('..', import.meta.url);

function read(path) {
  return readFileSync(new URL(path, repoUrl), 'utf8');
}

test('Python helper scripts compile cleanly', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(
    python,
    ['-m', 'py_compile', 'scripts/pyautogui_action.py', 'scripts/cua_action.py'],
    { cwd: repoUrl, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('desktop image wait uses monotonic timing and imports time globally', () => {
  const source = read('scripts/pyautogui_action.py');
  assert.match(source, /^import time$/m);
  assert.match(source, /start = time\.monotonic\(\)/);
  assert.doesNotMatch(source, /time\.time\(\) if ['"]time['"] in dir\(\)/);
});

test('CUA backend forwards the resolved driver path to the Python shim', () => {
  const source = read('src/backends/cua.js');
  assert.match(source, /NEWEST_DC_CUA_DRIVER: cuaPath/);
  assert.match(source, /runFile\(cuaPath, \['call', 'kill_app'/);
});

test('repo does not contain the old machine-specific user path in public runtime/docs files', () => {
  const files = [
    'README.md',
    'src/backends/codex.js',
    'src/backends/cua.js',
    'scripts/cua_action.py',
    'scripts/pyautogui_action.py',
    'docs/AGENTS.md',
    'SKILL.md',
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /\/Users\/duckets\//i, `${file} contains a machine-specific personal path`);
  }
});

test('screenshot prompt guard never reports an unscanned screenshot as safe', () => {
  const source = read('src/backends/cua.js');
  assert.match(source, /safe: null/);
  assert.match(source, /screenshot_not_scanned_without_ocr_text/);
});
