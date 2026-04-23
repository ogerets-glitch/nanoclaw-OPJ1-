# Build & Infrastructure

**Intent:** Fork-specific dependency management, security, and operational tooling.

## package.json

### Added dependencies (keep on upgrade)

```json
{
  "dependencies": {
    "grammy": "^1.39.3",
    "sharp": "^0.34.5"
  }
}
```

Upstream removed these — they must be re-added after each upgrade.

### Removed dependencies (don't re-add)

- `pino`, `pino-pretty` — replaced by upstream's built-in logger
- `yaml`, `zod` — no longer used

## .gitignore

Add these lines (fork-specific):

```
node_modules_backup/
.mcp.json
nanoclaw.pid
```

**Critical:** `.mcp.json` contains API URLs with potential tokens. Must stay in .gitignore.

## GitHub Workflows

Delete these upstream workflows (not needed for personal fork):

```
.github/workflows/bump-version.yml
.github/workflows/update-tokens.yml
```

## start-nanoclaw.sh

Copy as-is. Startup script for manual (non-systemd) operation:
- Stops existing instance via PID file
- Starts with nohup
- Logs to `logs/nanoclaw.{log,error.log}`

## Dockerfile Changes

See section 5 (container) for:
- `poppler-utils` package
- `pdf-reader` binary installation

## .env Variables Required

`/home/opj1claw/nanoclaw/.env` — chmod 600, owned by `opj1claw:opj1claw`, **nicht** im Repo (in `.gitignore`).

```
# Auth & Core
CLAUDE_CODE_OAUTH_TOKEN=<Claude Max OAuth token>
TELEGRAM_BOT_TOKEN=<@MontjoieOG77_bot token>

# MCP Server URLs (mit Key im Query-Param — wurden 2026-04-17 aus Source/Image extrahiert, Commit 11b2856)
OPENBRAIN_MCP_URL=https://openbrain-oliver.kozow.com/mcp?api_key=<OPENBRAIN_API_KEY>
RECHTSRECHERCHE_MCP_URL=https://rechtsrecherche-oliver.kozow.com/mcp?api_key=<RECHTSRECHERCHE_API_KEY>
ARBEITSMARKT_MCP_URL=https://arbeitsmarkt-oliver.kozow.com/mcp?api_key=<ARBEITSMARKT_API_KEY>
LOCATION_MCP_URL=https://<location-service-host>/mcp?api_key=<LOCATION_API_KEY>

# Kalender
CALENDAR_ICAL_URL=<Google Calendar private iCal URL>

# Location-Service Ingest (für Telegram-Location-Forwarding, Commit daebc66)
LOCATION_SERVICE_URL=http://127.0.0.1:<location-port>/ingest
LOCATION_INGEST_KEY=<ingest-secret>
```

Plus: Der Bot-Prozess liest eine zweite `.env` für Skill-Keys (durch den Container-Mount sichtbar) — siehe Section 11.
