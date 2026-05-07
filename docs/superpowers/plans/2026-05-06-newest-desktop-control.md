# Newest Desktop Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a consolidated MCP gateway for desktop and Android agent control in `Desktop/Newest Desktop Control`.

**Architecture:** A Node.js stdio MCP server owns protocol handling and routes tool calls to focused backends. Desktop actions use macOS utilities and PyAutoGUI fallback; Android actions use ADB. Codex Computer Use is detected through its supported app-bundle MCP entry point without modifying proprietary binaries.

**Tech Stack:** Node.js 18+ ESM, Node built-in `node:test`, macOS command-line tools, Python/PyAutoGUI fallback, Android Debug Bridge.

---

### Task 1: Project Skeleton and Tests

**Files:**
- Create: `package.json`
- Create: `src/response.js`
- Create: `src/backends/android.js`
- Create: `src/tools.js`
- Create: `test/android.test.js`
- Create: `test/tools.test.js`

- [ ] **Step 1: Write failing tests for Android command construction**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdbArgs, escapeInputText } from '../src/backends/android.js';

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
  assert.equal(escapeInputText('hello world'), 'hello%s world'.replace('%s ', '%sworld'));
});
```

- [ ] **Step 2: Write failing tests for tool aliases**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry } from '../src/tools.js';

test('registry includes explicit desktop, android, diagnostic, and alias tools', () => {
  const registry = createToolRegistry();
  const names = registry.listTools().tools.map((tool) => tool.name);
  assert.ok(names.includes('desktop_screenshot'));
  assert.ok(names.includes('android_devices'));
  assert.ok(names.includes('backend_status'));
  assert.ok(names.includes('screenshot'));
});

test('compatibility alias routes to matching desktop tool', async () => {
  const calls = [];
  const registry = createToolRegistry({
    desktop: {
      screenshot: async (args) => {
        calls.push(args);
        return { content: [{ type: 'text', text: 'desktop shot' }] };
      },
    },
  });
  const result = await registry.callTool('screenshot', { region: [1, 2, 3, 4] });
  assert.equal(result.content[0].text, 'desktop shot');
  assert.deepEqual(calls, [{ region: [1, 2, 3, 4] }]);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`

Expected: tests fail because `src/backends/android.js` and `src/tools.js` do not exist yet.

- [ ] **Step 4: Implement minimal modules**

Create the files with the public functions required by the tests.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`

Expected: all tests pass.

### Task 2: Desktop, Android, Codex, and MCP Server

**Files:**
- Create: `src/process.js`
- Create: `src/backends/desktop.js`
- Create: `src/backends/codex.js`
- Create: `src/server.js`
- Create: `README.md`
- Modify: `src/tools.js`
- Modify: `package.json`

- [ ] **Step 1: Add backend implementations**

Implement desktop actions using macOS commands and PyAutoGUI fallback, Android actions using ADB, and Codex status detection.

- [ ] **Step 2: Add MCP server loop**

Implement JSON-RPC stdio handling for `initialize`, `ping`, `tools/list`, and `tools/call`.

- [ ] **Step 3: Add docs and scripts**

Document installation, required permissions, MCP config, and Android prerequisites.

- [ ] **Step 4: Run verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run status`

Expected: JSON status output showing desktop, android, and Codex availability.
