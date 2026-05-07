import test from 'node:test';
import assert from 'node:assert/strict';
import {
  platformClipboardReadCandidates,
  platformLaunchCommand,
  platformShellCommand,
} from '../src/backends/desktop.js';

test('platformLaunchCommand uses macOS open', () => {
  assert.deepEqual(platformLaunchCommand('darwin', { app: 'Safari' }), {
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
