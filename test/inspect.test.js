import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const INSPECT = join(REPO_ROOT, 'scripts', 'inspect.js');

function run(args) {
  return spawnSync(process.execPath, [INSPECT, ...args], { encoding: 'utf8', cwd: REPO_ROOT });
}

test('inspect.js --list groups tools by namespace', () => {
  const result = run(['--list']);
  assert.equal(result.status, 0, `inspect failed: ${result.stderr}`);
  assert.match(result.stdout, /\[desktop\]/);
  assert.match(result.stdout, /\[android\]/);
  assert.match(result.stdout, /\[diagnostic\]/);
  assert.match(result.stdout, /\[alias\]/);
  assert.match(result.stdout, /Total: \d+ tools/);
  assert.ok(result.stdout.includes('desktop_screenshot'));
  assert.ok(result.stdout.includes('android_tap'));
  assert.ok(result.stdout.includes('backend_status'));
  assert.ok(result.stdout.includes('mouse_click'));
});

test('inspect.js one-shot returns text result for a read-only tool', () => {
  // Use a pure diagnostic tool so this test is deterministic on headless CI,
  // SSH sessions, and machines without Screen Recording permission.
  const result = run(['permissions_check']);
  assert.equal(result.status, 0, `inspect failed: ${result.stderr}`);
  assert.match(result.stdout, /"macos":/);
  assert.match(result.stdout, /"android":/);
});

test('inspect.js surfaces errors for tools that require args', () => {
  const result = run(['desktop_keyboard']);
  assert.match(result.stderr, /requires text, key, or press/);
});

test('inspect.js unknown tool surfaces an error', () => {
  const result = run(['definitely_not_a_real_tool']);
  assert.ok(result.status !== 0 || /error|Unknown|exception/i.test(result.stderr));
});
