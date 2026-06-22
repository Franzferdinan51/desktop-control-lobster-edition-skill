#!/usr/bin/env node
// scripts/inspect.js
// Interactive CLI for calling MCP tools against a live server. Useful for
// debugging and for trying out a tool before wiring it into an agent.
//
// Modes:
//   REPL:   npm run inspect          → prompt for tool name + JSON args, prints result
//   One-shot: node scripts/inspect.js desktop_screenshot '{}'
//             node scripts/inspect.js desktop_mouse_click '{"x":100,"y":200}'
//   List:   node scripts/inspect.js --list
//   Server: node scripts/inspect.js --server   → boots the MCP server in --status mode
//
// In REPL mode, type "tools" to list all tool names, "exit" or Ctrl-D to quit.

import { createInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import { createToolRegistry } from '../src/tools.js';

const USAGE = `inspect.js — interactive tool caller for newest-desktop-control

Usage:
  node scripts/inspect.js                       # start REPL
  node scripts/inspect.js <tool> [jsonArgs]    # one-shot call
  node scripts/inspect.js --list               # list all tool names
  node scripts/inspect.js --server             # boot server in --status mode

In REPL:
  > tools                    # show every registered tool
  > desktop_screenshot {}    # call a tool (JSON args, or empty {})
  > desktop_mouse_click {"x":100,"y":200,"button":"left"}
  > exit                     # quit
`;

async function oneShot(toolName, jsonArgs) {
  let args = {};
  if (jsonArgs && jsonArgs.trim() !== '') {
    try {
      args = JSON.parse(jsonArgs);
    } catch (error) {
      stderr.write(`Invalid JSON args: ${error.message}\n`);
      process.exit(2);
    }
  }
  const registry = createToolRegistry();
  const result = await registry.callTool(toolName, args);
  printResult(result);
}

function printResult(result) {
  if (!result) {
    stdout.write('(no result)\n');
    return;
  }
  if (result.isError) {
    const text = result.content?.[0]?.text ?? '(no error message)';
    stderr.write(`[error] ${text}\n`);
    return;
  }
  for (const block of result.content ?? []) {
    if (block.type === 'text') {
      stdout.write(`${block.text}\n`);
    } else if (block.type === 'image') {
      stdout.write(`[image: ${block.mimeType ?? 'image/png'}, ${block.data?.length ?? 0} base64 chars]\n`);
    } else {
      stdout.write(`[${block.type}: ${JSON.stringify(block).slice(0, 200)}]\n`);
    }
  }
}

async function listTools() {
  const registry = createToolRegistry();
  const tools = registry.listTools().tools;
  const groups = { desktop: [], android: [], diagnostic: [], alias: [] };
  for (const tool of tools) {
    if (tool.name.startsWith('desktop_')) groups.desktop.push(tool);
    else if (tool.name.startsWith('android_')) groups.android.push(tool);
    else if (['backend_status', 'codex_mcp_config', 'permissions_check'].includes(tool.name)) groups.diagnostic.push(tool);
    else groups.alias.push(tool);
  }
  for (const [name, group] of Object.entries(groups)) {
    if (group.length === 0) continue;
    stdout.write(`\n[${name}] (${group.length})\n`);
    for (const tool of group) {
      stdout.write(`  ${tool.name}\n`);
    }
  }
  stdout.write(`\nTotal: ${tools.length} tools\n`);
}

async function repl() {
  const registry = createToolRegistry();
  const rl = createInterface({ input: stdin, output: stdout, prompt: 'ndc> ' });
  stdout.write('newest-desktop-control REPL. Type "tools" to list, "exit" to quit.\n');
  rl.prompt();
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed === 'exit' || trimmed === 'quit') { rl.close(); return; }
    if (trimmed === 'tools' || trimmed === 'ls') { await listTools(); rl.prompt(); return; }
    if (trimmed === 'help' || trimmed === '?') { stdout.write(USAGE); rl.prompt(); return; }
    const space = trimmed.indexOf(' ');
    const toolName = space === -1 ? trimmed : trimmed.slice(0, space);
    const jsonArgs = space === -1 ? '{}' : trimmed.slice(space + 1);
    let args = {};
    try {
      args = JSON.parse(jsonArgs);
    } catch (error) {
      stderr.write(`Invalid JSON: ${error.message}\n`);
      rl.prompt();
      return;
    }
    try {
      const result = await registry.callTool(toolName, args);
      printResult(result);
    } catch (error) {
      stderr.write(`[exception] ${error.message}\n`);
    }
    rl.prompt();
  });
  rl.on('close', () => {
    stdout.write('\n');
    process.exit(0);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    await repl();
    return;
  }
  if (argv[0] === '--help' || argv[0] === '-h') {
    stdout.write(USAGE);
    return;
  }
  if (argv[0] === '--list' || argv[0] === '-l') {
    await listTools();
    return;
  }
  if (argv[0] === '--server' || argv[0] === '-s') {
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, ['src/server.js', '--status'], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
    return;
  }
  const [tool, jsonArgs] = argv;
  await oneShot(tool, jsonArgs ?? '{}');
}

main();
