---
goal: Add a permanent Codex-backed NanoClaw research group alongside existing Claude groups, using OneCLI vault-only authentication and the existing remote MCP services.
decisions: Reconcile the complete Codex v2 payload semantically rather than overwriting local code; model MCP servers as a backward-compatible stdio/HTTP union; use native Codex live web search first; deploy through an isolated canary group.
open_questions: (1) Resolved — Codex OpenAI vault secret exists (id
  dbf76e55-b92b-482b-a89d-df7b1ac70547, created via direct admin-key API
  call, bypassing the still-broken `onecli` CLI auth on `opj1claw`). Open:
  whether to actually repair `opj1claw`'s CLI auth long-term (not
  attempted, not needed for T3/T4) vs. leaving the CLI unauthenticated and
  using the admin-key-API pattern again for any future secret — deferred,
  not decided. (2) NEW, blocking T4, waiting on Oliver (asked
  2026-07-13, no answer yet — resume here): the T4 MCP-handshake canary
  hit a OneCLI gateway "credential not found" 403 (expected fail-closed
  behavior, not a bug) because the throwaway test identity had no
  credential rule for the external MCP host it was pointed at
  (`rechtsrecherche.og-monschau.de`). Three options on the table, Oliver
  to pick: (a) accept the partial evidence already gathered — SSRF/name
  validation + TOML generation + gateway TLS/proxy wiring all confirmed
  working, only the final authenticated tool-call wasn't exercised; (b)
  provision a OneCLI credential rule for a throwaway canary agent (needs
  either a working `onecli auth login` for `opj1claw`, still broken, or
  reusing the narrowly-scoped admin-key-API workaround — constraint says
  ask each time, so asked); (c) point the handshake test at a public,
  unauthenticated MCP server instead and re-run. (3) Whether to fix the
  two Codex-provider skill-loading YAML errors (`tiefensuche`, `wisdom`,
  found in T3) before or after `:latest` promotion — Oliver's call, not
  yet made.
constraints: No secrets in repository, logs, URLs, or chat; do not alter existing Claude groups; no push; no production service restart or interactive authentication without explicit confirmation; `:latest` promotion needs a fresh explicit confirmation separate from "continue the rollout" (T3 canary done, T4 promotion still gated); admin-key-API workaround (used once for the Codex vault secret in T3) requires asking Oliver again each time before reuse, never standing authorization.
updated_at: 2026-07-13
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
- status: Completed
- next_action: See T4 — `:latest` promotion + permanent group, blocked on
  Oliver's fresh confirmation and (per the Codex cross-model review below)
  a mandatory remote-MCP handshake test before that confirmation is asked
  for.
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

  **Canary test executed 2026-07-13 (plan gated by advisor + Codex
  cross-model review beforehand, both incorporated — see review notes
  below).** Two fully isolated agent groups created via `ncl` against the
  already-running production daemon (`Codex Canary` provider=codex,
  `Claude Canary` provider=default), each with `image-tag` set to the
  FULL image reference `nanoclaw-agent-v2-67315674:codex-candidate-6547acea`
  (first attempt used just the tag suffix — Docker then tried to pull a
  nonexistent top-level image `codex-candidate-6547acea:latest` and failed
  with exit 125; corrected to the full `repo:tag` form, which is what
  `container-runner.ts:556` expects verbatim). Each wired to its own
  isolated `cli`-channel messaging_group (`cli:codex-canary` /
  `cli:claude-canary` — never the reserved `cli:local` id) via the CLI
  adapter's `to:{channelType,platformId}` admin-redirect feature, one
  nonce test message each.
  - **Codex canary: PASS.** Nonce `CANARY-CDX-9f2b7a` came back exactly in
    `outbound.db`. Container log: `provider: codex`, real
    `codex app-server` spawn, `poll-loop` turn completed. Running
    container's `docker inspect --format '{{.Image}}'` == candidate image
    ID (`sha256:609248a30a2b...`). OneCLI gateway log shows the actual
    credentialed request, not just "gateway applied": WebSocket upgrade to
    `chatgpt.com/backend-api/codex/responses`, `injections_applied=2`,
    all forwarded requests `status=200`.
  - **Claude canary (same candidate image): PASS.** Nonce
    `CANARY-CLD-4e81c3` came back exactly. Container log showed one
    `Error: Rate limit (retryable: false, quota)` line — investigated, not
    a request failure: it's the SDK's `rate_limit_event` surfaced verbatim
    by `container/agent-runner/src/providers/claude.ts:589-590` (usage-
    threshold telemetry, not a failed call). Confirmed via the gateway
    log: both real `POST /v1/messages?beta=true` calls for this session
    returned `status=200`, `injections_applied=1`. Worth Oliver's
    awareness (account nearing some usage threshold today), not a
    code/image defect.
  - **Non-blocking finding:** 2 skills (`tiefensuche`, `wisdom`) fail to
    load under the Codex provider specifically — `codex_core::session`
    logs `invalid YAML: mapping values are not allowed in this context`
    for both `SKILL.md` files. Claude's skill loader tolerates whatever
    is in those files; Codex's YAML parser is stricter. Not investigated
    further (out of scope for the canary itself) — worth fixing before
    the permanent Codex group goes live with those skills enabled, since
    they'll silently fail to load for every Codex session otherwise.
  - Cleanup: containers stopped and confirmed absent before any DB/disk
    cleanup (both had `--rm`, so `docker stop` alone removed them).
    `ncl groups delete` cascaded sessions/wirings/destinations/
    container_configs but confirmed (by reading `removed{}` in its own
    JSON output) it does NOT cascade the `messaging_groups` row — deleted
    those two explicitly afterward (`ncl messaging-groups delete`).
    On-disk `groups/codex-canary/`, `groups/claude-canary/` and both
    `data/v2-sessions/<group-id>/` directories removed via exact recorded
    paths (no globs). **Left as intentional residue, Oliver's explicit
    choice:** the two OneCLI-side agent identities (`ensureAgent()`
    creates one per agent-group UUID on first spawn) — `ncl groups delete`
    doesn't touch OneCLI, and cleaning them up would need either the
    narrowly-scoped admin-key-API workaround again (constraint says: ask
    each time) or a working `onecli auth login` session for `opj1claw`
    (still broken, unrelated to this task). Oliver chose to leave them —
    dead identities, zero NanoClaw-side wiring, no secret exposure.
    Production service unaffected throughout: `NRestarts=0` before,
    during, and after.

  **Plan review before execution:** `advisor` subagent + Codex (`gpt-5.2`,
  read-only, high reasoning) both reviewed the canary plan and found real,
  load-bearing gaps that were fixed before running anything: `platform_id`
  must never be the reserved `local` id; the CLI adapter's `deliver()` is
  a no-op for any other platform_id so the reply must be read from
  `outbound.db`/logs, never awaited on the socket; `image-tag` must be
  verified as actually persisted (and, per Codex, the *running container's
  actual image ID* verified too — this caught the `repo:tag` mistake
  above); test only against the already-running production daemon, never
  a second instance (would hijack `cli.sock` and use the wrong `--user`);
  `ncl groups delete` doesn't cascade `messaging_groups` or OneCLI agent
  identities; a bare `outbound.db` row proves nothing since provider
  errors are persisted the same way as successes — a nonce prompt plus
  gateway-log corroboration was required instead.
- rollback: Keep the previous image and remove or stop only the new canary group.

### T4a: Permanente OPJ1-Codex-Gruppe auf Kandidaten-Image (ohne :latest-Promotion)
- depends_on: [T3]
- location: /home/opj1claw/nanoclaw (Branch chore/codex-canary-t3)
- description: Refinement von T4 (Entkopplung, mit Oliver abgestimmt) — permanente
  Codex-Research-Gruppe auf dem bereits gebauten Kandidaten-Image, ohne die riskante
  :latest-Promotion (die bleibt T4b, eigene Freigabe). Chat: bestehende Testgruppe
  deltachat:group:12 ("OPJ1 Codex") von Claude OPJ1 auf die neue Codex-Gruppe umgehängt.
- status: Completed
- next_action: — (T4a fertig. Offen: T4b :latest-Promotion (eigene Freigabe) + F1
  Rechtsrecherche/Location-Vault-Secrets. Codex-Skill-Fix beim nächsten Spawn final
  bestätigen — Standard-YAML-Parse ist bereits grün.)
- evidence: **Konkrete IDs.** Neue Agent-Gruppe "OPJ1 Codex" =
  a9e70f1c-4c4d-4fc6-be2f-db7e28007e58 (folder opj1-codex, provider=codex,
  image_tag=nanoclaw-agent-v2-67315674:codex-6547acea). Immutabler Image-Tag
  codex-6547acea → sha256:609248a30a2b (== Kandidat; :latest unangetastet 71d4ab4115e2;
  Rollback-Tag pre-codex-6547acea zeigt auf :latest). MCP: openbrain
  (https://openbrain-oliver.kozow.com/mcp) + arbeitsmarkt
  (https://arbeitsmarkt-oliver.kozow.com/mcp), beide type=http URL-only (Gateway
  injiziert). Rechtsrecherche+Location aufgeschoben (F1). Wiring atomar nicht möglich
  (agent-group-id nicht updatable) → neue Wiring 1b42f36e-c091-4cbc-b660-abb558febb33
  (group12→Codex, Felder geklont: pattern/./all/drop/shared/prio0) angelegt, alte Wiring
  c9275b31 gelöscht → genau eine Wiring für group12. Destination: Codex→group12 (opj1-codex)
  angelegt, alte Claude-OPJ1-Destination→group12 entfernt (Claude behält 6 andere,
  unbeschädigt). DB-Backup: data/v2.db.bak-1783942207.
  **Zwischenfall (behoben):** git checkout lief als root → 668 getrackte Dateien root:root
  → sofort zurück-gechownt auf opj1claw (0 root-Dateien außerhalb .git/data/groups).
  Ab da alle Ops als opj1claw (sudo -u opj1claw).
- **Schritt 5 VERIFIZIERT (2026-07-13 13:49, Olivers Nonce CDX-LIVE-7F3K):** Container
  nanoclaw-v2-opj1-codex-… auf Image sha256:609248a30a2b, `provider: codex`. Zugestellte
  Nachricht (messages_out, sess-1783943357051-spy626) enthält BEIDE dynamischen Tool-
  Ergebnisse + Nonce: OpenBrain get_stats (memories 573, documents 132, chunks 24332,
  volle Collection-Liste) UND Arbeitsmarkt health ({status/jobsuche/ausbildung/
  weiterbildung/coaching = ok}) + CDX-LIVE-7F3K. OneCLI-Gateway-Log korreliert auf
  agent="OPJ1 Codex" (agent_id b913da35): openbrain-oliver.kozow.com + arbeitsmarkt-
  oliver.kozow.com je MITM POST .../mcp(/) status=200 injections_applied=1 (307→200 ist
  der /mcp→/mcp/ Trailing-Slash-Redirect, den Codex' rmcp korrekt folgt). Kann nicht
  falsch bestehen (beide Tools, dynamische Felder, kein Fehlertext).
- **Schritt 6 (Skill-YAML) erledigt:** container/skills/{tiefensuche,wisdom}/SKILL.md —
  `description`-Plain-Scalar mit unquotetem `: ` (tiefensuche „Zwei Modi: --guided",
  wisdom „~540 Chunks): Sun Tzu") → in Single-Quotes gewrappt (Text wortgleich, für
  Claude weiter valide). RO-Mount container/skills → /app/skills, greift beim nächsten
  Spawn. Standard-YAML-Parse jetzt grün (yaml.safe_load); Codex-rmcp-Bestätigung folgt
  beim nächsten Codex-Turn.
- blocker: none — abgeschlossen.
- rollback: `ncl groups delete a9e70f1c…` (+ messaging_groups-Zeile bleibt, group12 gehört
  Oliver, NICHT löschen; Wiring/Destination aus data/v2.db.bak-1783942207 zurück); alte
  Wiring/Destination auf Claude OPJ1 (ag-1777053973937-w5v230) rekonstruieren:
  wiring group12→Claude + destination opj1-codex→group12. `docker rmi …:codex-6547acea`.
  Kein :latest/Service-Neustart berührt.
- files: DB (data/v2.db), Docker-Tags. Kein getrackter Code geändert.
- executor: claude-code
- reviewers: [codex]
- updated_at: 2026-07-13

### T4: Promote `:latest` and stand up the permanent Codex group
- depends_on: [T3]
- location: /home/opj1claw/nanoclaw
- description: Atomically retag the candidate image to `:latest`, verify
  the existing Claude production group still works after the swap, then
  create the permanent "OPJ1 Codex" agent group and move the already-live
  `deltachat:group:12` wiring (currently pointing at the Claude OPJ1
  group, set up 2026-07-12 for the chat-scoped-routing fix verification)
  from Claude OPJ1 onto the new Codex group.
- validation: `docker inspect` the promoted `:latest` image ID matches the
  former candidate; existing OPJ1 (Claude) DM roundtrip still works after
  the retag; new "OPJ1 Codex" chat gets a real Codex response after rewire.
- status: Blocked
- next_action: The remote-MCP-handshake test ran (2026-07-13, same isolated
  canary methodology as T3) — it's a **partial pass**, see evidence. To get
  a fully clean authenticated round-trip, Oliver needs to decide: (a)
  accept the current partial evidence as sufficient (SSRF/name validation
  + TOML/transport wiring confirmed, tool-level call not exercised), (b)
  provision a OneCLI credential rule for a throwaway canary agent to reach
  a real authenticated MCP target and re-run, or (c) point at a public,
  unauthenticated MCP server instead. None of these were decided yet —
  asked Oliver, awaiting reply. Separately, optionally fix the two
  Codex-provider skill-loading YAML errors found in T3 (`tiefensuche`,
  `wisdom`) so they don't silently fail once the permanent Codex group is
  live — Oliver's call whether that blocks promotion or is a fast-follow.
- evidence: MCP canary ("Codex MCP Canary", provider=codex, candidate
  image, remote HTTP MCP server `rechtsrecherche` →
  `https://rechtsrecherche.og-monschau.de/mcp` added via `ncl groups
  config add-mcp-server`) spawned successfully. Confirmed working end to
  end: `validateMcpHttpUrl` let the legitimate host through (no
  false-positive SSRF block), `validateMcpServerName` accepted the clean
  name, the config materialized into the container and Codex generated a
  real TOML `[mcp_servers.rechtsrecherche]` section from it (proven by the
  container log line `[agent-runner] Additional MCP server: rechtsrecherche
  (https://rechtsrecherche.og-monschau.de/mcp)` and Codex's `rmcp` client
  actually opening a real TLS connection to that exact host through the
  OneCLI gateway, MITM-intercepted correctly). **Where it stopped:** the
  gateway log shows `onecli_gateway::gateway::forward: credential not
  found method=POST url=https://rechtsrecherche.og-monschau.de:443/mcp
  status=403` — the gateway itself fail-closed because this brand-new
  throwaway canary identity has no configured credential-injection rule
  for that host (expected/correct security behavior, not a bug: OneCLI
  denies-by-default for unmapped targets). The Codex `rmcp` client then
  logged `worker quit with fatal: Transport channel closed, when
  Deserialize(Error("data did not match any variant of untagged enum
  JsonRpcMessage"...` — it tried to parse the gateway's 403 JSON error
  body as a JSON-RPC frame instead of surfacing "MCP server returned 403"
  cleanly. That's upstream `codex`/`rmcp` client behavior (not NanoClaw
  code), noted for completeness, not something to fix here. Net result:
  the specific security-relevant code (SSRF/name-injection validators,
  TOML generation, gateway TLS/proxy wiring for MCP hosts) is verified
  working; a full authenticated tool-call round-trip was not completed
  because the test target needed per-agent credentials this throwaway
  identity doesn't have. Cleaned up identically to T3 (container stopped
  and confirmed absent, `ncl groups delete` + explicit `messaging-groups
  delete`, on-disk dirs removed via exact paths); one more orphaned
  OneCLI agent identity left in place per Oliver's standing choice from
  T3. Service unaffected throughout (`NRestarts=0`).
- blocker: Awaiting Oliver's decision on the three options above, then —
  once T4's remaining prerequisites are settled — a fresh, explicit
  confirmation from Oliver before any `docker tag` / production restart.
  This is a deliberate policy gate (destructive/hard-to-reverse, affects
  all agent groups), not a technical blocker.
- rollback: `pre-codex-6547acea` tag still points at the untouched
  pre-promotion `:latest` image — re-tag back to it and restart to revert.
- files: —
- executor: claude-code
- reviewers: [advisor, codex]
- updated_at: 2026-07-13
