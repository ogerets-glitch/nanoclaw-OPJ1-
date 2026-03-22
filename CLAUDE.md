# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/` | Skills loaded inside agent containers (browser, status, formatting) |

## Skills

Four types of skills exist in NanoClaw. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full taxonomy and guidelines.

- **Feature skills** — merge a `skill/*` branch to add capabilities (e.g. `/add-telegram`, `/add-slack`)
- **Utility skills** — ship code files alongside SKILL.md (e.g. `/claw`)
- **Operational skills** — instruction-only workflows, always on `main` (e.g. `/setup`, `/debug`)
- **Container skills** — loaded inside agent containers at runtime (`container/skills/`)

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

## Contributing

Before creating a PR, adding a skill, or preparing any contribution, you MUST read [CONTRIBUTING.md](CONTRIBUTING.md). It covers accepted change types, the four skill types and their guidelines, SKILL.md format rules, PR requirements, and the pre-submission checklist (searching for existing PRs/issues, testing, description format).

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart

# Linux (systemd)
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Troubleshooting

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate skill, not bundled in core. Run `/add-whatsapp` (or `npx tsx scripts/apply-skill.ts .claude/skills/add-whatsapp && npm run build`) to install it. Existing auth credentials and groups are preserved.

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.

## Git & Versionskontrolle

Dieses Repo ist ein Fork: `origin` = Olivers Fork (ogerets-glitch/nanoclaw-OPJ1-), `upstream` = Original (qwibitai/nanoclaw).

### Nach jeder Code-Änderung:
```bash
git add -A && git commit -m "beschreibung" && git push origin main
```

### Niemals committen:
- `.mcp.json` (enthält API-Keys) — steht in .gitignore
- `.env` (enthält Secrets)
- `nanoclaw.pid` (temporär) — steht in .gitignore

### Updates vom Original holen:
```bash
git fetch upstream && git merge upstream/main
```
**ACHTUNG:** Nach upstream-Updates prüfen, ob der Circuit Breaker in `dist/group-queue.js` noch vorhanden ist. Falls überschrieben: in `src/group-queue.ts` neu einbauen und `npm run build`.

## Sync-History

| Datum | Upstream-Version | Commits | Konflikte | Notizen |
|-------|-----------------|---------|-----------|---------|
| 2026-03-22 | v1.2.21 | 41 | 4 (index.ts, remote-control.test.ts, package-lock.json, badge.svg) | Alle Custom-Patches erhalten (Circuit Breaker, Voice, Image-Vision, PDF, Location, Office-Docs, Telegram). Neues: ESLint, Claw CLI, Slack-Formatting-Skill, Security-Fix. |

## OpenBrain-Regeln
- Bei add_memory IMMER setzen: author="opj1", visibility=["global"]
  (oder spezifischer wenn Inhalt nur für bestimmte Agents relevant ist)
- Bei search_memory IMMER setzen: agent="opj1"
- Wenn ein OpenBrain-Suchergebnis dir konkret weitergeholfen hat,
  rufe reinforce_memory(id) auf
- Kategorien: fact (Fakten), learning (was funktioniert hat),
  error (was schiefging), preference (Olivers Vorlieben/Korrekturen)
- Rechtsfragen → Rechtsrecherche-MCP, nicht OpenBrain
