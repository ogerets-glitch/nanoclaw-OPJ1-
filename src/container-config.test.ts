/**
 * Regression guards for the MCP HTTP server validators — added alongside the
 * Codex-provider HTTP-MCP support after a security review found (1) no host
 * denylist, letting an approved URL target the hosts that bypass the OneCLI
 * gateway proxy (NO_PROXY=host.docker.internal,127.0.0.1,localhost in
 * container-runner.ts), and (2) no charset check on the server name, which
 * becomes an unescaped TOML section header for the Codex provider.
 */
import { describe, expect, it } from 'vitest';

import { validateMcpHttpUrl, validateMcpServerName } from './container-config.js';

describe('validateMcpHttpUrl', () => {
  it('accepts a normal https URL', () => {
    expect(validateMcpHttpUrl('https://example.com/mcp')).toBe('https://example.com/mcp');
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => validateMcpHttpUrl('ftp://example.com')).toThrow(/http or https/);
  });

  it('rejects credentials embedded in the URL', () => {
    expect(() => validateMcpHttpUrl('https://user:pass@example.com')).toThrow(/credentials/);
  });

  it('rejects the NO_PROXY-bypassed hosts (gateway-proxy SSRF)', () => {
    for (const url of [
      'http://localhost:10255/',
      'http://host.docker.internal:3001/',
      'http://127.0.0.1:8080/',
      'https://127.0.0.1/',
    ]) {
      expect(() => validateMcpHttpUrl(url)).toThrow(/bypasses the OneCLI credential gateway/);
    }
  });

  it('rejects link-local hosts including the cloud metadata address', () => {
    expect(() => validateMcpHttpUrl('http://169.254.169.254/latest/meta-data')).toThrow(
      /bypasses the OneCLI credential gateway/,
    );
  });

  it('rejects IPv6 loopback and link-local', () => {
    expect(() => validateMcpHttpUrl('http://[::1]:8080/')).toThrow(/bypasses the OneCLI credential gateway/);
  });
});

describe('validateMcpServerName', () => {
  it('accepts a normal name', () => {
    expect(validateMcpServerName('research-mcp')).toBe('research-mcp');
  });

  it('rejects a name that would inject an extra TOML section', () => {
    expect(() => validateMcpServerName('x]\n[mcp_servers.evil]\nurl = "http://x"')).toThrow(
      /letters, digits, dots, underscores, and hyphens/,
    );
  });

  it('rejects whitespace and other TOML-meaningful characters', () => {
    for (const name of ['has space', 'has"quote', 'has]bracket', 'has\ttab']) {
      expect(() => validateMcpServerName(name)).toThrow();
    }
  });
});
