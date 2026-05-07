import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry } from '../src/tools.js';

test('registry includes explicit desktop, android, diagnostic, and alias tools', () => {
  const registry = createToolRegistry();
  const names = registry.listTools().tools.map((tool) => tool.name);
  assert.ok(names.includes('desktop_screenshot'));
  assert.ok(names.includes('desktop_launch_app'));
  assert.ok(names.includes('desktop_keyboard'));
  assert.ok(names.includes('desktop_terminal'));
  assert.ok(names.includes('desktop_file_read'));
  assert.ok(names.includes('android_devices'));
  assert.ok(names.includes('android_screen_size'));
  assert.ok(names.includes('backend_status'));
  assert.ok(names.includes('codex_mcp_config'));
  assert.ok(names.includes('screenshot'));
  assert.ok(names.includes('launch_app'));
  assert.ok(names.includes('keyboard'));
  assert.ok(names.includes('computer_use_screenshot'));
  assert.ok(names.includes('terminal'));
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

test('launch_app alias routes to desktop launch app', async () => {
  const calls = [];
  const registry = createToolRegistry({
    desktop: {
      launchApp: async (args) => {
        calls.push(args);
        return { content: [{ type: 'text', text: 'launched' }] };
      },
    },
  });
  const result = await registry.callTool('launch_app', { app: 'Safari' });
  assert.equal(result.content[0].text, 'launched');
  assert.deepEqual(calls, [{ app: 'Safari' }]);
});

test('codex_mcp_config returns codex backend config', async () => {
  const registry = createToolRegistry({
    codex: {
      mcpConfig: () => ({
        mcpServers: {
          'computer-use': {
            command: '/bin/echo',
            args: ['mcp'],
            cwd: '/tmp',
            startup_timeout_sec: 20,
            tool_timeout_sec: 60,
          },
        },
      }),
    },
  });
  const result = await registry.callTool('codex_mcp_config', {});
  const parsed = JSON.parse(result.content[0].text);
  assert.equal(parsed.mcpServers['computer-use'].command, '/bin/echo');
  assert.equal(parsed.mcpServers['computer-use'].cwd, '/tmp');
  assert.equal(parsed.mcpServers['computer-use'].startup_timeout_sec, 20);
});

test('computer_use aliases route to matching desktop tools', async () => {
  const calls = [];
  const registry = createToolRegistry({
    desktop: {
      screenshot: async (args) => {
        calls.push(['screenshot', args]);
        return { content: [{ type: 'text', text: 'shot' }] };
      },
      launchApp: async (args) => {
        calls.push(['launch', args]);
        return { content: [{ type: 'text', text: 'launch' }] };
      },
    },
  });
  assert.equal((await registry.callTool('computer_use_screenshot', { display: 0 })).content[0].text, 'shot');
  assert.equal((await registry.callTool('computer_use_launch_app', { path: '/Applications/Safari.app' })).content[0].text, 'launch');
  assert.deepEqual(calls, [
    ['screenshot', { display: 0 }],
    ['launch', { path: '/Applications/Safari.app' }],
  ]);
});

test('keyboard compatibility tool routes to combined desktop keyboard handler', async () => {
  const calls = [];
  const registry = createToolRegistry({
    desktop: {
      keyboard: async (args) => {
        calls.push(args);
        return { content: [{ type: 'text', text: 'keyboard' }] };
      },
    },
  });
  const result = await registry.callTool('keyboard', { text: 'hello' });
  assert.equal(result.content[0].text, 'keyboard');
  assert.deepEqual(calls, [{ text: 'hello' }]);
});

test('lobster enhancement aliases route to desktop handlers', async () => {
  const calls = [];
  const registry = createToolRegistry({
    desktop: {
      terminal: async (args) => {
        calls.push(['terminal', args]);
        return { content: [{ type: 'text', text: 'term' }] };
      },
      fileRead: async (args) => {
        calls.push(['file_read', args]);
        return { content: [{ type: 'text', text: 'file' }] };
      },
    },
  });
  assert.equal((await registry.callTool('terminal', { command: 'pwd' })).content[0].text, 'term');
  assert.equal((await registry.callTool('file_read', { path: '/tmp/a' })).content[0].text, 'file');
  assert.deepEqual(calls, [
    ['terminal', { command: 'pwd' }],
    ['file_read', { path: '/tmp/a' }],
  ]);
});
