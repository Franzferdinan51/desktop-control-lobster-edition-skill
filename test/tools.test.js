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

test('mouse hover / right / middle click tools route to backend methods', async () => {
  const calls = [];
  const registry = createToolRegistry({
    desktop: {
      mouseHover: (args) => { calls.push(['mouseHover', args]); return { content: [{ type: 'text', text: 'hovered' }] }; },
      rightClick: (args) => { calls.push(['rightClick', args]); return { content: [{ type: 'text', text: 'right' }] }; },
      middleClick: (args) => { calls.push(['middleClick', args]); return { content: [{ type: 'text', text: 'middle' }] }; },
    },
  });
  await registry.callTool('desktop_mouse_hover', { x: 100, y: 200 });
  await registry.callTool('desktop_mouse_right_click', { x: 50, y: 60 });
  await registry.callTool('desktop_mouse_middle_click', {});
  const names = calls.map((c) => c[0]);
  assert.ok(names.includes('mouseHover'));
  assert.ok(names.includes('rightClick'));
  assert.ok(names.includes('middleClick'));
});

test('window / image-wait tools route to backend methods', async () => {
  const calls = [];
  const registry = createToolRegistry({
    desktop: {
      focusWindow: (args) => { calls.push(['focusWindow', args]); return { content: [{ type: 'text', text: 'focused' }] }; },
      screenshotWindow: (args) => { calls.push(['screenshotWindow', args]); return { content: [{ type: 'image', data: 'BASE64', mimeType: 'image/png' }] }; },
      getWindowInfo: (args) => { calls.push(['getWindowInfo', args]); return { content: [{ type: 'text', text: '{}' }] }; },
      waitForImage: (args) => { calls.push(['waitForImage', args]); return { content: [{ type: 'text', text: '{}' }] }; },
    },
  });
  const shot = await registry.callTool('desktop_screenshot_window', { title: 'Safari' });
  assert.equal(shot.content[0].type, 'image');
  assert.equal(shot.content[0].data, 'BASE64');
  await registry.callTool('desktop_focus_window', { title: 'Finder' });
  await registry.callTool('desktop_get_window_info', { title: 'Terminal' });
  await registry.callTool('desktop_wait_for_image', { image_path: '/tmp/x.png', timeout: 5 });
  const names = calls.map((c) => c[0]);
  for (const expected of ['focusWindow', 'screenshotWindow', 'getWindowInfo', 'waitForImage']) {
    assert.ok(names.includes(expected), `expected ${expected} in ${names}`);
  }
});

test('screenshot_window surfaces backend error gracefully', async () => {
  const registry = createToolRegistry({
    desktop: {
      screenshotWindow: () => { throw new Error('window not found'); },
    },
  });
  const result = await registry.callTool('desktop_screenshot_window', { title: 'Nope' });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /window not found/);
});

test('wait_for_image surfaces backend error gracefully', async () => {
  const registry = createToolRegistry({
    desktop: {
      waitForImage: () => { throw new Error('image_path required'); },
    },
  });
  const result = await registry.callTool('desktop_wait_for_image', {});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /image_path/);
});

test('new tools are advertised in tools/list', () => {
  const registry = createToolRegistry();
  const names = registry.listTools().tools.map((t) => t.name);
  for (const expected of [
    'desktop_mouse_hover',
    'desktop_mouse_right_click',
    'desktop_mouse_middle_click',
    'desktop_focus_window',
    'desktop_screenshot_window',
    'desktop_get_window_info',
    'desktop_wait_for_image',
  ]) {
    assert.ok(names.includes(expected), `tools/list should include ${expected}`);
  }
});
