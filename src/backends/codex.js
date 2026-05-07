import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const bundledPluginRoot = '/Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use';
const codexClientPath = join(
  bundledPluginRoot,
  'Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient',
);
const codexServicePath = join(
  bundledPluginRoot,
  'Codex Computer Use.app/Contents/MacOS/SkyComputerUseService',
);

const candidateClientPaths = [
  codexClientPath,
  join(
    homedir(),
    'Applications/Codex.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient',
  ),
  join(
    homedir(),
    '.codex/.tmp/bundled-marketplaces/openai-bundled/plugins/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient',
  ),
  '/Users/duckets/Desktop/computer-use-lobster/packages/computer-use-bundle/SkyComputerUseClient',
];

export function findCodexComputerUseClient() {
  return candidateClientPaths.find((path) => existsSync(path)) ?? null;
}

function cwdForClient(client) {
  if (client.startsWith(bundledPluginRoot)) return bundledPluginRoot;
  return dirname(client);
}

export function createCodexMcpConfig() {
  const client = findCodexComputerUseClient();
  if (!client) {
    return {
      available: false,
      reason: 'Codex Computer Use client was not found in known supported locations.',
      mcpServers: {},
    };
  }
  return {
    available: true,
    mcpServers: {
      'computer-use': {
        command: client,
        args: ['mcp'],
        cwd: cwdForClient(client),
        startup_timeout_sec: 20,
        tool_timeout_sec: 60,
      },
    },
    codexConfigToml: `[mcp_servers.computer-use]\ncommand = ${JSON.stringify(client)}\nargs = ["mcp"]\ncwd = ${JSON.stringify(cwdForClient(client))}\nstartup_timeout_sec = 20\ntool_timeout_sec = 60\n`,
  };
}

export function createCodexBackend() {
  return {
    status() {
      const client = findCodexComputerUseClient();
      const clientExists = Boolean(client);
      const serviceExists = existsSync(codexServicePath);
      return {
        available: clientExists,
        detail: {
          pluginRoot: bundledPluginRoot,
          client,
          service: serviceExists ? codexServicePath : null,
          launchMode: clientExists ? 'supported MCP command: SkyComputerUseClient mcp' : 'not installed',
          note: 'This gateway detects Codex Computer Use but does not patch or bypass the proprietary app bundle.',
        },
      };
    },
    mcpConfig() {
      return createCodexMcpConfig();
    },
  };
}
