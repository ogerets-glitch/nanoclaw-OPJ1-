/**
 * NanoClaw Agent Runner v2
 *
 * Runs inside a container. All IO goes through the session DB.
 * No stdin, no stdout markers, no IPC files.
 *
 * Config is read from /workspace/agent/container.json (mounted RO).
 * Only TZ and OneCLI networking vars come from env.
 *
 * Mount structure:
 *   /workspace/
 *     inbound.db        ← host-owned session DB (container reads only)
 *     outbound.db       ← container-owned session DB
 *     .heartbeat        ← container touches for liveness detection
 *     outbox/           ← outbound files
 *     agent/            ← agent group folder (CLAUDE.md, container.json, working files)
 *       container.json  ← per-group config (RO nested mount)
 *     global/           ← shared global memory (RO)
 *   /app/src/           ← shared agent-runner source (RO)
 *   /app/skills/        ← shared skills (RO)
 *   /home/node/.claude/ ← Claude SDK state + skill symlinks (RW)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './config.js';
import { buildSystemPromptAddendum } from './destinations.js';
// Providers barrel — each enabled provider self-registers on import.
// Provider skills append imports to providers/index.ts.
import './providers/index.js';
import { createProvider, type ProviderName } from './providers/factory.js';
import type { McpServerConfig } from './providers/types.js';
import { runPollLoop } from './poll-loop.js';

function log(msg: string): void {
  console.error(`[agent-runner] ${msg}`);
}

function normalizeMcpServer(entry: Record<string, unknown>): McpServerConfig | null {
  if (typeof entry.command === 'string' && Array.isArray(entry.args)) {
    return {
      command: entry.command,
      args: entry.args as string[],
      env: (entry.env as Record<string, string>) ?? {},
    };
  }
  if (typeof entry.url === 'string') {
    const headers = entry.headers as Record<string, string> | undefined;
    return { type: 'http', url: entry.url, ...(headers ? { headers } : {}) };
  }
  return null;
}

const CWD = '/workspace/agent';

async function main(): Promise<void> {
  const config = loadConfig();
  const providerName = config.provider.toLowerCase() as ProviderName;

  log(`Starting v2 agent-runner (provider: ${providerName})`);

  // Runtime-generated system-prompt addendum: agent identity (name) plus
  // the live destinations map. Everything else (capabilities, per-module
  // instructions, per-channel formatting) is loaded by Claude Code from
  // /workspace/agent/CLAUDE.md — the composed entry imports the shared
  // base (/app/CLAUDE.md) and each enabled module's fragment. Per-group
  // memory lives in /workspace/agent/CLAUDE.local.md (auto-loaded).
  const instructions = buildSystemPromptAddendum(config.assistantName || undefined);

  // Discover additional directories mounted at /workspace/extra/*
  const additionalDirectories: string[] = [];
  const extraBase = '/workspace/extra';
  if (fs.existsSync(extraBase)) {
    for (const entry of fs.readdirSync(extraBase)) {
      const fullPath = path.join(extraBase, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        additionalDirectories.push(fullPath);
      }
    }
    if (additionalDirectories.length > 0) {
      log(`Additional directories: ${additionalDirectories.join(', ')}`);
    }
  }

  // MCP server path — bun runs TS directly; no tsc build step in-image.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'mcp-tools', 'index.ts');

  // Build MCP servers config: nanoclaw built-in + container.json + project .mcp.json.
  // We merge .mcp.json explicitly because the Claude SDK ignores
  // setting-source discovery once `mcpServers` is passed at the API level.
  const mcpServers: Record<string, McpServerConfig> = {
    nanoclaw: {
      command: 'bun',
      args: ['run', mcpServerPath],
      env: {},
    },
  };

  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    mcpServers[name] = serverConfig;
    const desc = 'command' in serverConfig ? serverConfig.command : serverConfig.url;
    log(`Additional MCP server (container.json): ${name} (${desc})`);
  }

  const projectMcpPath = path.join(CWD, '.mcp.json');
  if (fs.existsSync(projectMcpPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(projectMcpPath, 'utf8')) as {
        mcpServers?: Record<string, Record<string, unknown>>;
      };
      for (const [name, entry] of Object.entries(raw.mcpServers ?? {})) {
        const normalized = normalizeMcpServer(entry);
        if (normalized) {
          mcpServers[name] = normalized;
          const desc = 'command' in normalized ? normalized.command : normalized.url;
          log(`Project MCP server (.mcp.json): ${name} (${desc})`);
        } else {
          log(`Skipping malformed MCP server entry in .mcp.json: ${name}`);
        }
      }
    } catch (err) {
      log(`Failed to parse .mcp.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const provider = createProvider(providerName, {
    assistantName: config.assistantName || undefined,
    mcpServers,
    env: { ...process.env },
    additionalDirectories: additionalDirectories.length > 0 ? additionalDirectories : undefined,
  });

  await runPollLoop({
    provider,
    cwd: CWD,
    systemContext: { instructions },
  });
}

main().catch((err) => {
  log(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
