import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

function requestServer(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['src/server.js'], {
      cwd: new URL('..', import.meta.url),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`server timeout: ${stderr}`));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      const lines = stdout.trim().split('\n').filter(Boolean);
      if (lines.length >= messages.length) {
        clearTimeout(timer);
        child.kill('SIGTERM');
        resolve(lines.map((line) => JSON.parse(line)));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    for (const message of messages) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }
  });
}

test('initialize echoes current Codex MCP protocol and advertises tool list changes', async () => {
  const [response] = await requestServer([
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'codex-mcp-client', version: 'test' },
      },
    },
  ]);
  assert.equal(response.result.protocolVersion, '2025-06-18');
  assert.equal(response.result.serverInfo.title, 'Newest Desktop Control');
  assert.equal(response.result.capabilities.tools.listChanged, true);
});
