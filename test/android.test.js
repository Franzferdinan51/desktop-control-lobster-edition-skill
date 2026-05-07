import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdbArgs, escapeInputText, parseCurrentActivity, parseScreenSize } from '../src/backends/android.js';

test('buildAdbArgs inserts device selector before command', () => {
  assert.deepEqual(buildAdbArgs({ device: 'emulator-5554' }, ['shell', 'input', 'tap', '10', '20']), [
    '-s',
    'emulator-5554',
    'shell',
    'input',
    'tap',
    '10',
    '20',
  ]);
});

test('buildAdbArgs omits selector when device is absent', () => {
  assert.deepEqual(buildAdbArgs({}, ['devices', '-l']), ['devices', '-l']);
});

test('escapeInputText prepares spaces for adb shell input text', () => {
  assert.equal(escapeInputText('hello world'), 'hello%sworld');
});

test('parseScreenSize extracts physical size', () => {
  assert.deepEqual(parseScreenSize('Physical size: 1080x2400\n'), { width: 1080, height: 2400 });
});

test('parseCurrentActivity extracts focused package and activity', () => {
  const output = 'mCurrentFocus=Window{abc u0 com.android.settings/.Settings}\n';
  assert.deepEqual(parseCurrentActivity(output), {
    raw: 'com.android.settings/.Settings',
    package: 'com.android.settings',
    activity: '.Settings',
  });
});
