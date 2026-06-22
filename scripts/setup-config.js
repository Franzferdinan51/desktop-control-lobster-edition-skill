#!/usr/bin/env node
// scripts/setup-config.js
// Generate ready-to-paste MCP server configuration for the agent framework
// you are integrating with. Prints config to stdout (and optionally writes
// to a file with --out).
//
// Usage:
//   node scripts/setup-config.js                          # list targets
//   node scripts/setup-config.js openclaw                 # print OpenClaw config
//   node scripts/setup-config.js hermes                   # print Hermes Agent config
//   node scripts/setup-config.js codex                    # print Codex CLI toml block
//   node scripts/setup-config.js claude-desktop           # print Claude Desktop JSON
//   node scripts/setup-config.js mcp-json                 # raw MCP JSON
//   node scripts/setup-config.js openclaw --out ~/.openclaw/mcp.json
//   node scripts/setup-config.js all                      # print every target
//
// All targets resolve the server path from this script's location, so the
// output is portable. The user can also override the path:
//   node scripts/setup-config.js openclaw --path /custom/path/to/src/server.js

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DEFAULT_SERVER_PATH = join(REPO_ROOT, 'src', 'server.js');

const KNOWN_TARGETS = ['openclaw', 'hermes', 'codex', 'claude-desktop', 'mcp-json', 'all'];

function parseArgs(argv) {
  const args = { target: null, out: null, path: null, pretty: true };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' || arg === '-o') { args.out = argv[++i]; continue; }
    if (arg === '--path' || arg === '-p') { args.path = argv[++i]; continue; }
    if (arg === '--no-pretty') { args.pretty = false; continue; }
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg.startsWith('--')) { args.unknown = arg; continue; }
    if (!args.target) { args.target = arg; continue; }
    args.unknown = arg;
  }
  return args;
}

function helpText() {
  return [
    'setup-config.js — generate MCP server config for popular agent frameworks',
    '',
    'Usage:',
    '  node scripts/setup-config.js <target> [--out file] [--path server.js] [--no-pretty]',
    '',
    'Targets:',
    '  openclaw        OpenClaw / DuckBot / Hermes-style gateways (JSON for mcp.json)',
    '  hermes          Hermes Agent (NousResearch) — emits the same JSON',
    '  codex           OpenAI Codex CLI (TOML block for config.toml)',
    '  claude-desktop  Anthropic Claude Desktop (claude_desktop_config.json)',
    '  mcp-json        Raw MCP server JSON (works for any stdio MCP client)',
    '  all             Print every target in turn',
    '',
    'Options:',
    '  --out, -o <file>   Write the first target to <file> (others still go to stdout)',
    '  --path, -p <file>  Override the server.js path (default: this repo\'s src/server.js)',
    '  --no-pretty        Emit compact JSON',
    '  --help, -h         Show this help',
    '',
    'Examples:',
    '  node scripts/setup-config.js openclaw --out ~/.openclaw/mcp.json',
    '  node scripts/setup-config.js hermes',
    '  node scripts/setup-config.js codex >> ~/.codex/config.toml',
  ].join('\n');
}

function buildMcpServerJson(serverPath) {
  return {
    command: 'node',
    args: [serverPath],
    env: {},
    transport: 'stdio',
    startup_timeout_sec: 20,
    tool_timeout_sec: 60,
  };
}

function renderOpenClaw(serverPath, { pretty }) {
  const config = {
    mcpServers: {
      'newest-desktop-control': buildMcpServerJson(serverPath),
    },
  };
  return JSON.stringify(config, null, pretty ? 2 : 0);
}

function renderHermes(serverPath, { pretty }) {
  // Hermes Agent uses the same JSON config shape as OpenClaw.
  // Per NousResearch/hermes-agent docs, MCP servers are declared in
  // ~/.hermes/mcp.json (or whatever mcp.config the operator sets).
  const config = {
    mcpServers: {
      'newest-desktop-control': buildMcpServerJson(serverPath),
    },
  };
  return JSON.stringify(config, null, pretty ? 2 : 0);
}

function renderCodex(serverPath) {
  // Codex CLI uses a TOML config. Emit the [mcp_servers.*] block that
  // can be appended to ~/.codex/config.toml.
  return [
    '[mcp_servers.newest-desktop-control]',
    `command = "node"`,
    `args = [${JSON.stringify(serverPath)}]`,
    `startup_timeout_sec = 20`,
    `tool_timeout_sec = 60`,
    '',
  ].join('\n');
}

function renderClaudeDesktop(serverPath, { pretty }) {
  // Claude Desktop stores MCP config in claude_desktop_config.json
  // (path varies per OS, but the schema is the same).
  const config = {
    mcpServers: {
      'newest-desktop-control': {
        command: 'node',
        args: [serverPath],
      },
    },
  };
  return JSON.stringify(config, null, pretty ? 2 : 0);
}

function renderMcpJson(serverPath, { pretty }) {
  return JSON.stringify(buildMcpServerJson(serverPath), null, pretty ? 2 : 0);
}

const RENDERERS = {
  openclaw: { render: renderOpenClaw, header: '# OpenClaw / DuckBot / generic gateway — paste into mcp.json' },
  hermes: { render: renderHermes, header: '# Hermes Agent — paste into ~/.hermes/mcp.json (or operator-configured mcp.config)' },
  codex: { render: renderCodex, header: '# Codex CLI — append to ~/.codex/config.toml' },
  'claude-desktop': { render: renderClaudeDesktop, header: '# Claude Desktop — paste into claude_desktop_config.json' },
  'mcp-json': { render: renderMcpJson, header: '# Raw MCP server JSON — works for any stdio MCP client' },
};

function emit(target, serverPath, options) {
  const renderer = RENDERERS[target];
  if (!renderer) {
    process.stderr.write(`Unknown target: ${target}\nKnown: ${KNOWN_TARGETS.join(', ')}\n`);
    process.exit(2);
  }
  const body = renderer.render(serverPath, options);
  return `${renderer.header}\n${body}`;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.target && !args.out)) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  const serverPath = args.path ?? DEFAULT_SERVER_PATH;
  const target = args.target ?? 'openclaw';
  const targets = target === 'all' ? Object.keys(RENDERERS) : [target];

  let firstOutput = null;
  for (const t of targets) {
    const out = emit(t, serverPath, { pretty: args.pretty });
    if (targets.length > 1) {
      process.stdout.write(`\n===== ${t} =====\n`);
    }
    process.stdout.write(`${out}\n`);
    if (firstOutput === null) firstOutput = out;
  }

  if (args.out && firstOutput) {
    writeFileSync(args.out, `${firstOutput}\n`, 'utf8');
    process.stderr.write(`\nWrote ${target === 'all' ? targets[0] : target} config to ${args.out}\n`);
  }
}

main();
