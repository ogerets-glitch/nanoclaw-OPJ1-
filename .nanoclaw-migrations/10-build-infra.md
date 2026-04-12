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

```
CLAUDE_CODE_OAUTH_TOKEN=<token>
TELEGRAM_BOT_TOKEN=<token>
CALENDAR_ICAL_URL=<google calendar ical url>
```

These are NOT in the repo (chmod 600, owned by service user).
