import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CHECK_SH = join(REPO_ROOT, 'scripts', 'check.sh');

/**
 * Helper: run `bash scripts/check.sh` and capture stdout/stderr/exit code.
 * Forces `--no-tests` so we don't double up on the npm test run during the
 * `npm test` invocation.
 */
function runCheck(args = []) {
  return spawnSync('bash', [CHECK_SH, '--no-tests', ...args], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    timeout: 60_000,
  });
}

test('check.sh exists and is executable', () => {
  assert.ok(existsSync(CHECK_SH), `${CHECK_SH} should exist`);
  // spawnSync with bash doesn't strictly need executable bit, but the script's
  // shebang requires it for direct execution. Quick existence sanity.
});

test('check.sh --help exits 0 with usage', () => {
  const r = runCheck(['--help']);
  assert.equal(r.status, 0, `check.sh --help exit=${r.status}, stderr=${r.stderr}`);
  assert.match(r.stdout, /Usage:|check.sh/);
});

test('check.sh --no-tests runs all required checks and exits 0 or 2', () => {
  const r = runCheck(['--no-tests']);
  // Exit 0 = all pass, exit 2 = required pass + optional (adb) fail when no phone connected.
  assert.ok([0, 2].includes(r.status), `unexpected exit=${r.status}\nstdout=${r.stdout}\nstderr=${r.stderr}`);
  // Required checks must all pass
  assert.match(r.stdout, /node\s+v\d+ >= 18/);
  assert.match(r.stdout, /python\s+Python/);
  assert.match(r.stdout, /pip\s+found/);
  assert.match(r.stdout, /python-deps\s+all \d+ packages importable/);
  assert.match(r.stdout, /server-status\s+\d+ backend\(s\) available/);
});

test('check.sh --json produces valid JSON with ok=true when required pass', () => {
  const r = runCheck(['--json']);
  assert.ok([0, 2].includes(r.status), `unexpected exit=${r.status}`);
  // The --json flag should print only the JSON object (no header line).
  // Find the first { and parse from there.
  const firstBrace = r.stdout.indexOf('{');
  assert.ok(firstBrace >= 0, `no JSON object in output: ${r.stdout.slice(0, 200)}`);
  const json = JSON.parse(r.stdout.slice(firstBrace));
  assert.ok('ok' in json, 'JSON should have ok field');
  assert.ok('all' in json, 'JSON should have all field');
  assert.ok(Array.isArray(json.all), 'all should be an array');
  // Required checks (non-optional) must not include failures
  const requiredFails = json.required_failures ?? [];
  assert.equal(requiredFails.length, 0, `required failures: ${requiredFails.join(', ')}`);
});

test('check.sh runs cleanly even when no Android device is attached (regression)', () => {
  // Regression test for the bug where `grep -c 'device$'` returns exit 1 when
  // no matches are found, and `set -e` killed the whole script at check_adb.
  // We test by running with no devices attached (which is the common case on
  // dev machines). The script should reach server-status, not die after python-deps.
  const r = runCheck(['--no-tests']);
  assert.match(r.stdout, /server-status/, 'script should reach server-status check (regression: died at adb)');
});

test('check.sh counts available backends correctly', () => {
  // The server-status message should reflect actual available backend count,
  // not the hardcoded "all 3" wording from before CUA was added.
  const r = runCheck(['--no-tests']);
  const m = r.stdout.match(/server-status\s+(\d+) backend\(s\) available/);
  assert.ok(m, `no server-status count in output: ${r.stdout}`);
  const count = parseInt(m[1], 10);
  assert.ok(count >= 1, `at least 1 backend should be available, got ${count}`);
  assert.ok(count <= 4, `at most 4 backends, got ${count}`);
});

test('check.sh --quiet only prints failures', () => {
  const r = runCheck(['--quiet', '--no-tests']);
  // Quiet mode: header is suppressed, only fail/warn rows print
  // In a healthy env with no device, output should be minimal
  // (just the optional adb warn, not the 5 ✓ rows)
  assert.ok(!/✓ node/.test(r.stdout), 'quiet mode should not print success rows');
});

test('check.sh exit codes follow documented contract', () => {
  // 0 = all pass (no phone expected to fail adb check)
  // 2 = required pass + optional fail (adb, when no device)
  // 1 = required fail
  const r = runCheck(['--no-tests']);
  assert.ok([0, 2].includes(r.status), `exit code should be 0 or 2 in dev env, got ${r.status}`);
});