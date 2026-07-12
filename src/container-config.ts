/**
 * Container config types and materialization.
 *
 * Source of truth is the `container_configs` table in the central DB.
 * This module provides:
 *   - Type definitions for the file shape (read by the container runner)
 *   - `materializeContainerJson()` — writes `groups/<folder>/container.json`
 *     from the DB at spawn time
 *   - `configFromDb()` — builds a `ContainerConfig` from a DB row + agent group
 */
import fs from 'fs';
import path from 'path';

import { GROUPS_DIR } from './config.js';
import { getContainerConfig } from './db/container-configs.js';
import { getAgentGroup } from './db/agent-groups.js';
import type { AgentGroup, ContainerConfigRow } from './types.js';

export interface McpStdioServerConfig {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  instructions?: string;
}

export interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  instructions?: string;
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

// Hosts every agent container reaches directly, bypassing the OneCLI gateway
// proxy (container-runner.ts sets NO_PROXY=host.docker.internal,127.0.0.1,localhost
// for local Voice/STT access) — the proxy's credential-injection and allowlist
// checks never see requests to these. An MCP HTTP server pointed here would let
// an approved-but-unreviewed URL reach internal services (OneCLI gateway,
// credential proxy) directly. 169.254.169.254 (cloud metadata) is blocked too,
// even though this host isn't in NO_PROXY, as defense in depth.
const DISALLOWED_MCP_HOSTNAMES = new Set(['localhost', 'host.docker.internal']);

function isDisallowedMcpHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (DISALLOWED_MCP_HOSTNAMES.has(lower)) return true;
  // IPv4 loopback (127.0.0.0/8) and link-local (169.254.0.0/16, incl. cloud metadata).
  const v4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) {
    const first = Number(v4[1]);
    const second = Number(v4[2]);
    if (first === 127) return true;
    if (first === 169 && second === 254) return true;
  }
  // IPv6 loopback and link-local.
  if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('[fe80:') || lower.startsWith('[::1]')) {
    return true;
  }
  return false;
}

// MCP server names become raw TOML section headers for the Codex provider
// (`[mcp_servers.<name>]`, container/agent-runner/.../codex-app-server.ts) —
// unrestricted, a name with embedded newlines could inject extra config
// keys/sections. Mirrored in container/agent-runner/src/mcp-tools/self-mod.ts
// (container-side defense-in-depth); this is the authoritative host-side check.
const MCP_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;

export function validateMcpServerName(value: string): string {
  if (!MCP_NAME_RE.test(value)) {
    throw new Error('MCP server name must contain only letters, digits, dots, underscores, and hyphens');
  }
  return value;
}

export function validateMcpHttpUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (err) {
    throw new Error('MCP URL must be a valid http(s) URL', { cause: err });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('MCP URL must use http or https');
  }
  if (url.username || url.password) {
    throw new Error('MCP URL must not contain credentials; use OneCLI-managed headers');
  }
  if (isDisallowedMcpHost(url.hostname)) {
    throw new Error(`MCP URL must not target ${url.hostname} — this host bypasses the OneCLI credential gateway`);
  }
  return url.toString();
}

export interface AdditionalMountConfig {
  hostPath: string;
  containerPath: string;
  readonly?: boolean;
}

/** Shape of the materialized `container.json` file read by the container runner. */
export interface ContainerConfig {
  mcpServers: Record<string, McpServerConfig>;
  packages: { apt: string[]; npm: string[] };
  imageTag?: string;
  additionalMounts: AdditionalMountConfig[];
  skills: string[] | 'all';
  provider?: string;
  groupName?: string;
  assistantName?: string;
  agentGroupId?: string;
  maxMessagesPerPrompt?: number;
  model?: string;
  effort?: string;
  /** Per-agent-group env vars. Applied last → wins over OneCLI values. */
  env?: Record<string, string>;
}

/** Build a `ContainerConfig` from a DB row + agent group identity. */
export function configFromDb(row: ContainerConfigRow, group: AgentGroup): ContainerConfig {
  return {
    mcpServers: JSON.parse(row.mcp_servers) as Record<string, McpServerConfig>,
    packages: {
      apt: JSON.parse(row.packages_apt) as string[],
      npm: JSON.parse(row.packages_npm) as string[],
    },
    imageTag: row.image_tag ?? undefined,
    additionalMounts: JSON.parse(row.additional_mounts) as AdditionalMountConfig[],
    skills: JSON.parse(row.skills) as string[] | 'all',
    provider: row.provider ?? undefined,
    groupName: group.name,
    assistantName: row.assistant_name ?? group.name,
    agentGroupId: group.id,
    maxMessagesPerPrompt: row.max_messages_per_prompt ?? undefined,
    model: row.model ?? undefined,
    effort: row.effort ?? undefined,
    env: row.env ? (JSON.parse(row.env) as Record<string, string>) : undefined,
  };
}

/**
 * Materialize `container.json` from the DB. Called at spawn time so the
 * container always sees fresh config. Returns the `ContainerConfig` for
 * use by the caller (buildMounts, buildContainerArgs, etc.).
 */
export function materializeContainerJson(agentGroupId: string): ContainerConfig {
  const group = getAgentGroup(agentGroupId);
  if (!group) throw new Error(`Agent group not found: ${agentGroupId}`);

  const row = getContainerConfig(agentGroupId);
  if (!row) throw new Error(`Container config not found for agent group: ${agentGroupId}`);

  const config = configFromDb(row, group);

  const p = path.join(GROUPS_DIR, group.folder, 'container.json');
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n');

  return config;
}
