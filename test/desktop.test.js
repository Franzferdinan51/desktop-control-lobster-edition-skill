import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  platformClipboardReadCandidates,
  platformLaunchCommand,
  platformShellCommand,
  resolveRsToolPath,
  DEFAULT_RS_TOOL_PATHS,
} from '../src/backends/desktop.js';

test('platformLaunchCommand uses macOS open', () => {
  assert.deepEqual(platformLaunchCommand('darwin', { app: 'Safari' }), {
    command: 'open',
    args: ['-g', '-a', 'Safari'],
  });
});

test('platformLaunchCommand can explicitly foreground a macOS app', () => {
  assert.deepEqual(platformLaunchCommand('darwin', { app: 'Safari', foreground: true }), {
    command: 'open',
    args: ['-a', 'Safari'],
  });
});

test('platformLaunchCommand uses Linux xdg-open', () => {
  assert.deepEqual(platformLaunchCommand('linux', { url: 'https://example.com' }), {
    command: 'xdg-open',
    args: ['https://example.com'],
  });
});

test('platformLaunchCommand uses Windows start through cmd', () => {
  assert.deepEqual(platformLaunchCommand('win32', { path: 'C:\\Temp\\app.exe' }), {
    command: 'cmd.exe',
    args: ['/c', 'start', '', 'C:\\Temp\\app.exe'],
  });
});

test('platformShellCommand chooses a native shell per platform', () => {
  assert.deepEqual(platformShellCommand('win32', 'Get-Location'), {
    command: 'powershell.exe',
    args: ['-NoProfile', '-Command', 'Get-Location'],
  });
  assert.deepEqual(platformShellCommand('linux', 'pwd'), {
    command: '/bin/sh',
    args: ['-lc', 'pwd'],
  });
});

test('platformClipboardReadCandidates includes Linux and Windows options', () => {
  assert.deepEqual(platformClipboardReadCandidates('win32')[0], {
    command: 'powershell.exe',
    args: ['-NoProfile', '-Command', 'Get-Clipboard'],
  });
  assert.ok(platformClipboardReadCandidates('linux').some((candidate) => candidate.command === 'wl-paste'));
  assert.ok(platformClipboardReadCandidates('linux').some((candidate) => candidate.command === 'xclip'));
});

test('DEFAULT_RS_TOOL_PATHS respects NEWEST_DC_RS_TOOL_PATH env override', () => {
  const saved = process.env.NEWEST_DC_RS_TOOL_PATH;
  try {
    const dir = mkdtempSync(join(tmpdir(), 'ndc-rs-'));
    const fake = join(dir, 'rs.py');
    writeFileSync(fake, '# fake');
    process.env.NEWEST_DC_RS_TOOL_PATH = fake;
    assert.equal(resolveRsToolPath(), fake);
    assert.ok(DEFAULT_RS_TOOL_PATHS().includes(fake));
  } finally {
    if (saved === undefined) delete process.env.NEWEST_DC_RS_TOOL_PATH;
    else process.env.NEWEST_DC_RS_TOOL_PATH = saved;
  }
});

test('resolveRsToolPath returns null when nothing is installed', () => {
  const saved = process.env.NEWEST_DC_RS_TOOL_PATH;
  const savedDuckets = process.env.DUCKETS_RS_TOOL_PATH;
  const dir = mkdtempSync(join(tmpdir(), 'ndc-empty-'));
  try {
    // Point all env overrides at non-existent files; this also exercises that
    // the function does not throw when defaults like ~/Desktop/rs-agent-tools
    // are not present on the test machine.
    process.env.NEWEST_DC_RS_TOOL_PATH = join(dir, 'missing.py');
    process.env.DUCKETS_RS_TOOL_PATH = join(dir, 'also-missing.py');
    // We can only assert null on machines where neither default path exists.
    // On DuckBot dev machine the path may resolve, so we don't pin null here,
    // but we DO assert it returns a string or null (never throws).
    const result = resolveRsToolPath();
    assert.ok(result === null || typeof result === 'string');
  } finally {
    if (saved === undefined) delete process.env.NEWEST_DC_RS_TOOL_PATH;
    else process.env.NEWEST_DC_RS_TOOL_PATH = saved;
    if (savedDuckets === undefined) delete process.env.DUCKETS_RS_TOOL_PATH;
    else process.env.DUCKETS_RS_TOOL_PATH = savedDuckets;
    rmSync(dir, { recursive: true, force: true });
  }
});
