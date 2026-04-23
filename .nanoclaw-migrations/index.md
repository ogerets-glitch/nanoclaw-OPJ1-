# NanoClaw Migration Guide — OPJ1 Fork

Generated: 2026-04-12 · **Updated: 2026-04-24**
Base (merge-base HEAD upstream/main at last update): `a81e1651b5e48c9194162ffa2c50a22283d5ecd3` (PR #1836 docs/v2-preview-announcement)
HEAD at last update: `303a7f0` (chore(dockerfile): record YouTube toolchain additions for migration guide)
Upstream main at last update: `9e480a0` (upstream v2.0.x, ~394 Commits ahead of Base)
Original Base at guide generation: `934f063` (v1.2.52)

## Sections

1. [Applied Skills](01-skills.md) — Upstream skill branches to re-merge
2. [Telegram Channel](02-telegram.md) — Full grammy-based Telegram implementation (**+ Location-Forwarding seit 2026-04-18**)
3. [Image & Vision](03-image-vision.md) — Photo download, processing, multimodal prompts
4. [Voice & Audio](04-voice-audio.md) — Whisper STT (8384), TTS OpenAI primär (8385), **Piper Fallback auf 8386 umgezogen**
5. [Container & Credentials](05-container.md) — Credential fallback, env vars, Dockerfile, agent-runner (**+ YouTube-Toolchain seit 2026-04-24**)
6. [Session Commands](06-session-commands.md) — /compact orchestration
7. [Circuit Breaker](07-circuit-breaker.md) — Resilience in group-queue
8. [Identity & Persona](08-identity.md) — OPJ1 persona, CLAUDE.md, behavioral principles
9. [Skills & Config](09-skills-config.md) — Calendar, PDF, Philosophie-Feed, MCP (**+ Location-MCP, Keys via .env seit 2026-04-17**)
10. [Build & Infra](10-build-infra.md) — Dependencies, .gitignore, workflows, startup, **vollständige .env-Variablen-Liste**
11. [Runtime-Artefakte außerhalb Git](11-runtime-artifacts.md) — systemd-Unit, Skill-Keys, yt-transcript-Skill, Cookies, container_config-DB
12. [Daten-Migration v1→v2](12-data-migration.md) — upstream/feat/migrate-from-v1 Skripte

## Migration Plan (Order of Operations)

### Phase 1 — Vorbereitung (reversibel, ohne Downtime)
0. **Externes Backup** (Pflicht): `rsync -a /home/opj1claw/nanoclaw/ /home/opj1claw/nanoclaw.v1-backup-<DATE>/` + `cp store/messages.db /root/backup/messages.db.v1-backup-<DATE>` + SHA256
0a. **agent-update-check.timer disablen** (`systemctl disable --now agent-update-check.timer`), sonst fährt ein wöchentlicher `git merge upstream/main` rein
0b. **Working tree clean** halten — migrate-nanoclaw verlangt `git status --porcelain` = leer
0c. **Upstream refetchen** (`git fetch upstream --prune`)

### Phase 2 — Upgrade im Worktree (Downtime 1–2 h)
1. **Pre-flight** (migrate-nanoclaw 2.0): clean tree, upstream branch detect, Service stoppen, laufenden Agent-Container stoppen
2. **Safety Net** (2.1): `git branch backup/pre-migrate-<ts>` + `git tag pre-migrate-<ts>`
3. **Worktree erstellen** (2.3): `git worktree add .upgrade-worktree upstream/main --detach`
4. **Skills mergen** (2.4): alle aus section 1 gelisteten Skills + `skill/compact` + **`skill/init-onecli`** nur wenn OneCLI aktiv genutzt wird (nicht Teil dieser Migration — bleibt Legacy-`.env`-Pfad, siehe Sections 5/9/10)
5. **Build/Infra apply** (section 10): package.json grammy/sharp wieder rein, .gitignore-Additions, workflows löschen, start-nanoclaw.sh
6. **Install + Build**: `npm install && npm run build` (**oder `bun install && bun run build`** falls v2 auf Bun umgestellt hat — dann auch systemd-Unit ExecStart anpassen)
7. **Type-Definitionen apply** (section 3): `src/types.ts` (ImageAttachment, images, location, modelOverride, thinkingBudget)
8. **image.ts apply** (section 3): neue Datei
9. **Telegram channel apply** (section 2): `src/channels/telegram.ts` + test + `src/channels/index.ts`-Registrierung + **Location-Forwarding-Block**
10. **Container changes apply** (section 5): `container-runner.ts` (Credential-Fallback, ImageContentBlock, Calendar-URL, Model-Override, MCP-URL-Durchreichung), `agent-runner/src/index.ts` (Multimodal, MCP-Server-Block mit **env-basierter URL-Resolution**)
11. **Dockerfile apply** (section 5): poppler-utils + pdf-reader **+ YouTube-Toolchain (Deno, yt-dlp, python3, Cookie-Wrapper)**
12. **Session commands apply** (section 6): session-commands.ts + test + integration in index.ts
13. **index.ts apply** (sections 3/5/6): image-cache, session command integration, voice-mode, model override
14. **Circuit breaker apply** (section 7): `src/group-queue.ts`-Modifikationen
15. **task-scheduler apply** (section 9): Skill-Model-Defaults
16. **Identity files copy** (section 8): `CLAUDE.md` root + `groups/telegram_main/CLAUDE.md` (vom main tree)
17. **Custom Skills copy** (section 1): `container/skills/{calendar,pdf-reader,philosophie-feed}` + `.claude/skills/{philosophie-feed,memex}` + `.mcp.json` + `.claude/settings.local.json`
18. **Build + test** im Worktree (2.6): `npm install && npm run build && npm test`
19. **Optional Live-Test** (2.7): Worktree mit symlinked store/data/groups/.env, Test-Nachricht
20. **Swap in Main-Tree** (2.8): `git reset --hard <worktree-HEAD>`, `npm install && npm run build` im Main-Tree

### Phase 3 — Daten-Migration (section 12, zwischen Swap und Service-Start)
21. **Prüfen ob `feat/migrate-from-v1` in main ist** — wenn nicht: Oliver fragt
22. **Validate vor Migration**: `setup/migrate-v1/validate.ts --pre`
23. **Migration**: `setup/migrate-v1/groups.ts`, dann `setup/migrate-v1/tasks.ts`
24. **Validate nach Migration**: `setup/migrate-v1/validate.ts --post`

### Phase 4 — Runtime-Artefakte (section 11, vor/nach Service-Start)
25. **systemd-Unit prüfen** (`/etc/systemd/system/opj1-nanoclaw.service`): ExecStart zu node vs. bun
26. **settings.json prüfen**: `LAST30DAYS_CONFIG_DIR`-Override noch vorhanden? (aus Backup zurückspielen wenn weg)
27. **yt-transcript-Skill-Dateien prüfen**: unter `data/sessions/telegram_main/.claude/skills/yt-transcript/`, aus Backup reinstallieren wenn v2 den Pfad umbenannt hat
28. **`groups/global/config/last30days/.env` + `secrets/youtube-cookies.txt` prüfen** (beides bleibt normalerweise unverändert)
29. **Service starten**: `systemctl start opj1-nanoclaw.service` + Log-Check

### Phase 5 — Verifikation (siehe Section 11, Verifikations-Liste)

## Risk Areas

- **container/agent-runner/src/index.ts** — Stark geänderte Kernintegration (SDK-Query, Message-Stream, /compact-Handler, Multimodal, MCP-Server-Block). v2 könnte die `query()`-Signatur und Message-Typen ändern; dann ist manuelle Anpassung beim Reapply nötig.
- **src/index.ts** — Image-Cache-Hook, Session-Command-Integration, Voice-Mode-Ausleitung greifen tief in die Nachrichten-Schleife. Wenn upstream die Message-Loop refactored, wird die Integration eine Stelle sein, an der ein Claude-Sub-Agent Entscheidungen treffen muss.
- **src/container-runner.ts** — Credential-Fallback und Env-Var-Injection liegen in `buildContainerArgs()`. Wenn v2 die Funktionssignatur ändert oder OneCLI-Integration erzwingt, muss der Fallback-Zweig neu eingepasst werden.
- **Bun vs. Node (v2)** — Wenn v2 tatsächlich auf Bun umgestellt hat: Dockerfile-Basis ändern (node → bun), yt-dlp-Wrapper bleibt gleich, Deno bleibt, **systemd-Unit ExecStart** muss angepasst werden, `package.json`-`scripts` ggf. auf `bun run` umstellen. Verifikation: Build + Unit-Tests im Worktree vor Swap.
- **Daten-Migration (Section 12)** — `feat/migrate-from-v1` ist zum Zeitpunkt dieses Guide-Updates (2026-04-24) noch nicht in `main`. Upgrade-Zeitpunkt vor Phase-2-Start prüfen; wenn nicht: warten oder Branch direkt mergen (eigene Entscheidung).
- **YouTube-Caption-Sackgasse** — `browser-fetch.sh` funktioniert nicht vom VPS (Hetzner-CDN-Block). Bleibt als dokumentierte Sackgasse in `data/sessions/.../skills/yt-transcript/`. Beim Migrate nicht löschen, aber auch nicht testen.
- **Port-Shift bei TTS** — Piper ist am 2026-04-22 von 8385 auf 8386 umgezogen, tts-openai neu primär auf 8385. Telegram-Channel-Code muss primär 8385 ansprechen; bei Fallback-Logik 8386 vorsehen.
