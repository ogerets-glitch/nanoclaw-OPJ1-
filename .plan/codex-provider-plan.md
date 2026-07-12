---
goal: Add a permanent Codex-backed NanoClaw research group alongside existing Claude groups, using OneCLI vault-only authentication and the existing remote MCP services.
decisions: Reconcile the complete Codex v2 payload semantically rather than overwriting local code; model MCP servers as a backward-compatible stdio/HTTP union; use native Codex live web search first; deploy through an isolated canary group.
open_questions: Resolved — Codex OpenAI vault secret exists (id dbf76e55-b92b-482b-a89d-df7b1ac70547, created via direct admin-key API call, bypassing the still-broken `onecli` CLI auth on `opj1claw`). Open: whether to actually repair `opj1claw`'s CLI auth long-term (not attempted, not needed for T3/T4) vs. leaving the CLI unauthenticated and using the admin-key-API pattern again for any future secret — that choice is deferred, not decided.
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
- next_action: Codex vault secret now exists (see evidence) — the
  `onecli`-CLI auth path stays broken for `opj1claw` and does NOT need
  fixing; it was bypassed, not repaired. Next: resume the production-
  equivalent Claude/Codex canaries against `codex-candidate-6547acea`
  (throwaway container, production-matching mounts/user/network/credential-
  proxy flags, a real Codex request through the vaulted secret, plus a
  Claude-provider smoke test in the same candidate image). Only after both
  pass: atomic retag to `:latest`, immediately followed by testing both the
  new Codex group and the existing Claude group. Do not promote `:latest`
  without a new explicit confirmation (still applies). Do NOT reuse the
  admin-key-via-raw-API pattern for anything beyond this one Codex secret
  without asking Oliver again each time — it was approved narrowly, step by
  step, not as a general tool.
- evidence: Code is committed locally at `906c2d1d` plus formatting follow-up
  `6547acea`; working tree was clean before this handoff update. Full host suite
  passed 798/798, runner suite passed 176/176, both TypeScript checks passed,
  and candidate build completed successfully. Current production image
  `nanoclaw-agent-v2-67315674:latest` remains unchanged at
  `sha256:71d4ab4115e2`; rollback tag `pre-codex-6547acea` points to that same
  image. Candidate `codex-candidate-6547acea` exists at
  `sha256:609248a30a2b`. OneCLI CLI 2.2.5 (the `versions.json` pin) was installed
  at `/home/opj1claw/.local/bin/onecli`, owner `opj1claw:opj1claw`, mode 0755;
  it reaches gateway 1.41.0 and reports server status `ok`. The first Codex
  device login succeeded at OpenAI but vault creation failed because the CLI
  was missing. After installing it, `onecli secrets list` returned
  `AUTH_REQUIRED`; Oliver then tried `onecli auth login`, but the existing
  local NanoClaw gateway key was rejected. No key/token value was recorded.
  A pre-existing ownership fault on `logs/setup.log` was also corrected from
  `root:root` to `opj1claw:opj1claw` (0644), verified writable by the service
  user. No service restart, DB mutation, group creation, wiring, `:latest`
  retag, or push occurred.
- blocker: none — resolved. Root cause: `onecli auth login` and
  `onecli secrets list/create` (the CLI) require a session established via
  `onecli auth login`, which rejects both credentials available on this host
  (NanoClaw's `ONECLI_API_KEY`, an agent-scoped token — wrong type; and
  `/root/.onecli/admin-api-key.json`, rejected by the login endpoint
  specifically with "invalid API key: the server rejected this key"). Read
  the actual `/api/secrets` route source (`resolveApiAuth` →
  `validateApiKey`, `/opt/onecli/apps/web/src/...`, NB: that local checkout
  is stale at release 1.18.2 vs. the running `ghcr.io/onecli/onecli:1.41.0`,
  so this was only used to understand auth *shape*, not trusted for exact
  current schema) — the REST route validates the bearer token against the
  `ApiKey` DB table directly, independent of the CLI's login-session
  mechanism. Confirmed empirically (with a deliberately empty POST body,
  Oliver ran the curl himself): the admin key authenticates fine against
  `POST /api/secrets` (HTTP 400 body-validation error, not 401) even though
  it fails `onecli auth login`. Used this to bypass the CLI entirely: ran
  `codex login --device-auth` directly (not through the wrapper script) with
  a controlled `CODEX_HOME` so the resulting `auth.json` survived instead of
  being auto-deleted on the wrapper's failure path, then POSTed it straight
  to `/api/secrets` with the admin key as Bearer token (`name: "Codex"`,
  `type: "openai"` — accepted first try, no need for the `"generic"`
  fallback — `hostPattern: "chatgpt.com"`, `value` = full `auth.json`
  contents). Result: HTTP 201, secret id `dbf76e55-b92b-482b-a89d-df7b1ac70547`,
  created `2026-07-12T21:18:05.343Z`. No secret value was ever printed to
  a transcript or log — only the server's own redacted preview
  (`"••••••••Z\"\n}"`) was shown. Temp `CODEX_HOME` dir removed after the
  write. Each sensitive sub-step (reading the admin key file, the empty
  test POST, the real write) was individually confirmed by Oliver before
  execution — this plan file records what happened, not standing
  authorization for future reuse of the same pattern.
  request (see next_action) — needs a fresh confirmation when device pairing
  actually runs, not before.
- rollback: Keep the previous image and remove or stop only the new canary group.
