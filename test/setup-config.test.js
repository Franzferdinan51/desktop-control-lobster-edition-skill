import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SETUP_CONFIG = join(REPO_ROOT, 'scripts', 'setup-config.js');

function run(args) {
  const result = spawnSync(process.execPath, [SETUP_CONFIG, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`setup-config.js ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

test('setup-config.js lists help when no target given', () => {
  const out = run(['--help']);
  assert.match(out, /setup-config\.js — generate MCP server config/);
  assert.match(out, /openclaw/);
  assert.match(out, /hermes/);
  assert.match(out, /codex/);
  assert.match(out, /claude-desktop/);
  assert.match(out, /mcp-json/);
});

test('setup-config.js openclaw emits valid mcpServers JSON', () => {
  const out = run(['openclaw']);
  const start = out.indexOf('{');
  const json = out.slice(start);
  const parsed = JSON.parse(json);
  assert.ok(parsed.mcpServers);
  assert.ok(parsed.mcpServers['newest-desktop-control']);
  const srv = parsed.mcpServers['newest-desktop-control'];
  assert.equal(srv.command, 'node');
  assert.ok(Array.isArray(srv.args));
  assert.match(srv.args[0], /src[\\/]+server\.js$/);
  assert.equal(srv.transport, 'stdio');
});

test('setup-config.js hermes emits the same MCP JSON shape', () => {
  const out = run(['hermes']);
  const start = out.indexOf('{');
  const parsed = JSON.parse(out.slice(start));
  assert.ok(parsed.mcpServers['newest-desktop-control']);
  assert.equal(parsed.mcpServers['newest-desktop-control'].command, 'node');
});

test('setup-config.js codex emits a TOML block with [mcp_servers.*]', () => {
  const out = run(['codex']);
  assert.match(out, /\[mcp_servers\.newest-desktop-control\]/);
  assert.match(out, /command = "node"/);
  assert.match(out, /startup_timeout_sec = 20/);
});

test('setup-config.js claude-desktop emits a Claude Desktop-style JSON', () => {
  const out = run(['claude-desktop']);
  const start = out.indexOf('{');
  const parsed = JSON.parse(out.slice(start));
  assert.ok(parsed.mcpServers['newest-desktop-control']);
  const srv = parsed.mcpServers['newest-desktop-control'];
  assert.equal(srv.command, 'node');
  // Claude Desktop doesn't need transport/startup_timeout_sec keys.
  assert.equal(srv.transport, undefined);
});

test('setup-config.js mcp-json emits a single server object', () => {
  const out = run(['mcp-json']);
  const start = out.indexOf('{');
  const parsed = JSON.parse(out.slice(start));
  assert.equal(parsed.command, 'node');
  assert.ok(Array.isArray(parsed.args));
});

test('setup-config.js --path overrides the server path', () => {
  const out = run(['openclaw', '--path', '/custom/path/server.js', '--no-pretty']);
  assert.match(out, /"args":\["\/custom\/path\/server\.js"\]/);
});

test('setup-config.js unknown target exits with non-zero', () => {
  const result = spawnSync(process.execPath, [SETUP_CONFIG, 'bogus'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown target/);
});

test('setup-config.js all target emits every renderer header', () => {
  const out = run(['all']);
  for (const target of ['openclaw', 'hermes', 'codex', 'claude-desktop', 'mcp-json']) {
    assert.ok(out.includes(`===== ${target} =====`), `missing section for ${target}`);
  }
});
