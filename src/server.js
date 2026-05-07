#!/usr/bin/env node
import { createDesktopBackend } from './backends/desktop.js';
import { createAndroidBackend } from './backends/android.js';
import { createCodexBackend } from './backends/codex.js';
import { createToolRegistry } from './tools.js';

const registry = createToolRegistry({
  desktop: createDesktopBackend(),
  android: createAndroidBackend(),
  codex: createCodexBackend(),
});

if (process.argv.includes('--status')) {
  const result = await registry.callTool('backend_status', {});
  process.stdout.write(`${result.content?.[0]?.text ?? '{}'}\n`);
  process.exit(0);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

async function handle(request) {
  const id = request.id;
  if (request.method === 'initialize') {
    const protocolVersion = request.params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: true } },
        serverInfo: {
          name: 'newest-desktop-control',
          title: 'Newest Desktop Control',
          version: '1.0.0',
        },
      },
    });
    return;
  }

  if (request.method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }

  if (request.method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: registry.listTools() });
    return;
  }

  if (request.method === 'tools/call') {
    const { name, arguments: args = {} } = request.params ?? {};
    const result = await registry.callTool(name, args);
    send({ jsonrpc: '2.0', id, result });
    return;
  }

  if (request.method?.startsWith('notifications/')) return;

  send({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${request.method}` },
  });
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline === -1) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    try {
      void handle(JSON.parse(line));
    } catch (error) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: error.message } });
    }
  }
});
