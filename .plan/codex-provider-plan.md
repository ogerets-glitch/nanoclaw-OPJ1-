---
goal: Add a permanent Codex-backed NanoClaw research group alongside existing Claude groups, using OneCLI vault-only authentication and the existing remote MCP services.
decisions: Reconcile the complete Codex v2 payload semantically rather than overwriting local code; model MCP servers as a backward-compatible stdio/HTTP union; use native Codex live web search first; deploy through an isolated canary group.
open_questions: Device pairing and creation of the permanent group require Oliver's interactive approval after all code and canary prerequisites pass.
constraints: No secrets in repository, logs, URLs, or chat; do not alter existing Claude groups; no push; no production service restart or interactive authentication without explicit confirmation.
updated_at: 2026-07-12
---

### T1: Reconcile Codex v2 provider payload
- depends_on: []
- location: /home/opj1claw/nanoclaw
- description: Reconcile host, container, setup, AGENTS, memory, and exchange-archive provider seams with the current v2 payload.
- validation: pnpm vitest run src/providers/codex-registration.test.ts src/providers/codex-host-contribution.test.ts src/providers/codex-agents-md.test.ts setup/providers/
- status: Completed
- next_action: Begin T2 by defining the backward-compatible MCP server union and updating its consumers.
- evidence: Reconciled the current upstream/providers payload (including later archive/skill fixes), wired host/container/setup registration, pinned @openai/codex 0.138.0, and ported provider file events without dropping local poll-loop behavior. Host/setup tests 18/18 passed; runner provider tests 44/44 passed; host and runner TypeScript checks passed; git diff --check passed.
- blocker:
- rollback: Revert the implementation commits; existing Claude groups remain unchanged.

### T2: Add remote HTTP MCP configuration
- depends_on: [T1]
- location: /home/opj1claw/nanoclaw
- description: Introduce a backward-compatible stdio/HTTP MCP union across host materialization, CLI/self-mod, runner providers, and Codex TOML output.
- validation: pnpm test && pnpm exec tsc -p container/agent-runner/tsconfig.json --noEmit
- status: Completed
- next_action: —
- evidence: Picked up by claude-code after Codex hit its usage limit (see updated_at). Discriminated
  `McpStdioServerConfig | McpHttpServerConfig` union implemented in
  `src/container-config.ts` / `container/agent-runner/src/providers/types.ts`,
  consumers updated (`self-mod.ts` MCP tool, `src/modules/self-mod/{request,apply}.ts`,
  `mcp-to-opencode.ts`, `writeCodexConfigToml`/`codex-app-server.ts` TOML output,
  `container/agent-runner/src/index.ts` + `config.ts`). Legacy stdio DB records
  need no migration (optional `type` field, defaults to stdio).
  **Security-reviewer pass (mandatory before commit per CLAUDE.md, since this
  touches auth/provider/DB code) found two real issues, both fixed:**
  (1) HIGH — `validateMcpHttpUrl` had no host denylist; a URL targeting
  `host.docker.internal`/`127.0.0.1`/`localhost` (the hosts every container
  reaches directly via `NO_PROXY`, bypassing the OneCLI credential-gateway
  proxy) would SSRF straight at internal services. Fixed with a host denylist
  (loopback, link-local incl. cloud metadata, the three `NO_PROXY` hosts) in
  both the authoritative host-side validator (`container-config.ts`) and the
  container-side `self-mod.ts` copy (defense in depth). (2) MEDIUM — MCP
  server `name` was interpolated unescaped into TOML section headers
  (`[mcp_servers.<name>]`), allowing section injection via a name containing
  newlines. Fixed with a charset validator (`validateMcpServerName`),
  authoritative host-side + container-side copy. Regression tests added:
  `src/container-config.test.ts` (9 tests, incl. the exact injection payload
  and the SSRF host list). Full suite verified after: `tsc --noEmit` clean,
  798/798 host Vitest tests green (84 files). Container-side Bun tests not
  re-run on this host (bun unavailable outside the container image).
- blocker:
- rollback: Revert the MCP commit; legacy command-based DB records require no migration.

### T3: Build, review, and canary preparation
- depends_on: [T1, T2]
- location: /home/opj1claw/nanoclaw
- description: Run full verification, rebuild the container image, and prepare an isolated Codex canary without changing existing groups.
- validation: pnpm run build && pnpm test && cd container/agent-runner && bun test
- status: In Progress
- next_action: Candidate-tagged image build (`container/build.sh
  codex-candidate-<commit>`), NOT `:latest` directly — a container-runner.ts
  read confirmed every group without a custom image shares the `:latest` tag,
  so a direct rebuild would make the existing Claude group's next wake the
  unplanned first test of the new image. Rollback-tag the current production
  image first. See `/root/.claude/plans/arbeitsauftrag-plan-file-handoff-tender-lark.md`
  ("Anschlussauftrag: Codex-Gruppe live schalten") for the full, advisor- and
  Codex-reviewed sequence — canary request + Claude-provider smoke test in
  the candidate image, only then atomic retag to `:latest`.
- evidence: —
- blocker: Interactive device pairing and production-facing group operations require Oliver's confirmation.
- rollback: Keep the previous image and remove or stop only the new canary group.
