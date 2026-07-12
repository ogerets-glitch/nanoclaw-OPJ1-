/**
 * Self-modification MCP tools: install_packages, add_mcp_server.
 *
 * Both are fire-and-forget — the tool writes a system action row and returns
 * immediately. The host processes the request (including admin approval)
 * and notifies the agent via a chat message when complete. Admin approval
 * is approval to apply the change: `install_packages` auto-rebuilds the
 * per-agent image and restarts the container; `add_mcp_server` just
 * updates `container.json` and restarts (bun runs TS directly — no build
 * step needed for a pure MCP wiring change).
 *
 * Package names are sanitized here at the tool boundary AND re-validated on
 * the host side (defense in depth).
 */
import { writeMessageOut } from '../db/messages-out.js';
import { registerTools } from './server.js';
import type { McpToolDefinition } from './types.js';

function log(msg: string): void {
  console.error(`[mcp-tools] ${msg}`);
}

function generateId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
}

const APT_RE = /^[a-z0-9][a-z0-9._+-]*$/;
const NPM_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const MAX_PACKAGES = 20;

// MCP server names become raw TOML section headers for the Codex provider
// (`[mcp_servers.<name>]`, codex-app-server.ts) — unrestricted, a name with
// embedded newlines could inject extra config keys/sections. Same charset as
// NPM_RE without the scope prefix.
const MCP_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;

// Hosts every agent container reaches directly, bypassing the OneCLI gateway
// proxy (container-runner.ts sets NO_PROXY=host.docker.internal,127.0.0.1,localhost
// for local Voice/STT access) — mirrors validateMcpHttpUrl in
// src/container-config.ts (host side); duplicated here because this file
// compiles separately (container-side).
const DISALLOWED_MCP_HOSTNAMES = new Set(['localhost', 'host.docker.internal']);

function isDisallowedMcpHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (DISALLOWED_MCP_HOSTNAMES.has(lower)) return true;
  const v4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) {
    const first = Number(v4[1]);
    const second = Number(v4[2]);
    if (first === 127) return true;
    if (first === 169 && second === 254) return true;
  }
  if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('[fe80:') || lower.startsWith('[::1]')) {
    return true;
  }
  return false;
}

export const installPackages: McpToolDefinition = {
  tool: {
    name: 'install_packages',
    description:
      'Install apt and/or npm packages into YOUR per-agent container image. Requires admin approval; fire-and-forget. On approval, the image is rebuilt and the container is restarted automatically.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        apt: {
          type: 'array',
          items: { type: 'string' },
          description: 'apt packages to install (names only, no version specs or flags)',
        },
        npm: {
          type: 'array',
          items: { type: 'string' },
          description: 'npm packages to install globally (names only, no version specs)',
        },
        reason: { type: 'string', description: 'Why these packages are needed' },
      },
    },
  },
  async handler(args) {
    const apt = (args.apt as string[]) || [];
    const npm = (args.npm as string[]) || [];
    if (apt.length === 0 && npm.length === 0) return err('At least one apt or npm package is required');
    if (apt.length + npm.length > MAX_PACKAGES) return err(`Maximum ${MAX_PACKAGES} packages per request`);

    const invalidApt = apt.find((p) => !APT_RE.test(p));
    if (invalidApt)
      return err(`Invalid apt package name: "${invalidApt}". Only lowercase letters, digits, and ._+- allowed.`);
    const invalidNpm = npm.find((p) => !NPM_RE.test(p));
    if (invalidNpm) return err(`Invalid npm package name: "${invalidNpm}". No version specs or shell characters.`);

    const requestId = generateId();
    writeMessageOut({
      id: requestId,
      kind: 'system',
      content: JSON.stringify({
        action: 'install_packages',
        apt,
        npm,
        reason: (args.reason as string) || '',
      }),
    });

    log(`install_packages: ${requestId} → apt=[${apt.join(',')}] npm=[${npm.join(',')}]`);
    return ok(`Package install request submitted. You will be notified when admin approves or rejects.`);
  },
};

export const addMcpServer: McpToolDefinition = {
  tool: {
    name: 'add_mcp_server',
    description:
      'Wire an EXISTING third-party MCP server into YOUR per-agent runtime config using either command + args (stdio) or url + headers (streamable HTTP). Requires admin approval; fire-and-forget.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'MCP server name (unique identifier)' },
        command: { type: 'string', description: 'Command to run the MCP server' },
        args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
        env: { type: 'object', description: 'Environment variables for the server' },
        url: { type: 'string', description: 'Streamable HTTP MCP endpoint' },
        headers: { type: 'object', description: 'HTTP headers; use onecli-managed for credential values' },
      },
      required: ['name'],
    },
  },
  async handler(args) {
    const name = args.name as string;
    const command = args.command as string | undefined;
    const url = args.url as string | undefined;
    if (!name) return err('name is required');
    if (!MCP_NAME_RE.test(name)) {
      return err('name must contain only letters, digits, dots, underscores, and hyphens');
    }
    if (Boolean(command) === Boolean(url)) return err('provide exactly one of command or url');
    let validatedUrl: string | undefined;
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return err('url must use http or https');
        if (parsed.username || parsed.password)
          return err('url must not contain credentials; use OneCLI-managed headers');
        if (isDisallowedMcpHost(parsed.hostname)) {
          return err(`url must not target ${parsed.hostname} — this host bypasses the OneCLI credential gateway`);
        }
        validatedUrl = parsed.toString();
      } catch {
        return err('url must be a valid http(s) URL');
      }
    }

    const requestId = generateId();
    writeMessageOut({
      id: requestId,
      kind: 'system',
      content: JSON.stringify({
        action: 'add_mcp_server',
        name,
        ...(validatedUrl
          ? { type: 'http', url: validatedUrl, headers: (args.headers as Record<string, string>) || {} }
          : { command, args: (args.args as string[]) || [], env: (args.env as Record<string, string>) || {} }),
      }),
    });

    log(`add_mcp_server: ${requestId} → "${name}" (${validatedUrl ?? command})`);
    return ok(`MCP server request submitted. You will be notified when admin approves or rejects.`);
  },
};

registerTools([installPackages, addMcpServer]);
