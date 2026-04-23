# Runtime-Artefakte außerhalb Git

**Intent:** Dateien, die der Bot zur Laufzeit braucht, die aber NICHT im Repo liegen (und auch nie dürfen — Secrets, personalisierte Konfiguration, Skill-Dateien in State-Verzeichnissen). Der `/migrate-nanoclaw`-Skill fasst diese Pfade bewusst nicht an („data directories are never touched"), deshalb hier manuell dokumentiert. Nach dem Swap in Phase 2 müssen diese Artefakte überprüft oder wiederhergestellt werden.

## 1. systemd-Unit (Host)

**Pfad:** `/etc/systemd/system/opj1-nanoclaw.service`

Nicht im Repo, wird von Hand gepflegt. Relevante Felder:

```ini
[Service]
Type=simple
User=opj1claw
WorkingDirectory=/home/opj1claw/nanoclaw
EnvironmentFile=/home/opj1claw/nanoclaw/.env
ExecStart=/usr/bin/node /home/opj1claw/nanoclaw/dist/index.js
Restart=always
RestartSec=5
```

**Migration-Relevanz:** Wenn upstream v2 auf Bun statt Node umgestellt hat, muss `ExecStart` entsprechend (`/usr/bin/bun run …` o.ä.) angepasst werden. Prüfen durch Diff von `package.json` (Feld `main`, `scripts.start`) vor und nach Swap.

## 2. Host-seitige `.env` (MCP-URLs, Telegram-Token)

**Pfad:** `/home/opj1claw/nanoclaw/.env`

Enthält die in Section 10 gelisteten Variablen. Bleibt beim Swap unverändert (Worktree-Flow symlinkt sie), muss aber nach Swap vom Bot-Prozess lesbar sein (`chmod 600`, owner `opj1claw:opj1claw`).

## 3. Skill-Config außerhalb des Skill-Ordners

**Pfad:** `/home/opj1claw/nanoclaw/groups/global/config/last30days/.env` (600, `opj1claw:opj1claw`)

Wird durch den rw-Mount `groups/global/` → `/workspace/global/` automatisch im Container sichtbar. Contains:

```
BRAVE_API_KEY=<…>
SCRAPECREATORS_API_KEY=<…>
OPENROUTER_API_KEY=<…>
XAI_API_KEY=<…>
GEMINI_API_KEY=<…>
```

Aktiviert wird die Config via `LAST30DAYS_CONFIG_DIR=/workspace/global/config/last30days` in **`data/sessions/telegram_main/.claude/settings.json`**:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
    "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD": "1",
    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "0",
    "LAST30DAYS_CONFIG_DIR": "/workspace/global/config/last30days"
  }
}
```

**Migration-Relevanz:** `groups/` bleibt vom Skill unberührt. Nach Swap:
- Prüfen ob die `settings.json`-Env-Map noch den `LAST30DAYS_CONFIG_DIR`-Override enthält (v2 könnte eine andere Default-`settings.json` erzeugen, die das überschreibt)
- `.env`-Datei ist unverändert, liegt weiter richtig

## 4. yt-transcript-Skill (liegt in `data/sessions/…`, nicht im Repo)

**Pfad:** `/home/opj1claw/nanoclaw/data/sessions/telegram_main/.claude/skills/yt-transcript/`

Drei Dateien:
- `SKILL.md` (113 Zeilen, 7.7 KB) — Gemini-Primärpfad mit Model-Fallback-Kette, Fehlertabelle, Dokumentation des Hetzner-CDN-Block
- `browser-fetch.sh` (4.9 KB, `chmod 755`) — Fallback-Wrapper mit Playwright-Auth-State-Injection; **funktional tot** (Timedtext-CDN blockiert Hetzner-IPs), bleibt als dokumentierte Sackgasse
- `parse-captions.py` (559 B) — kleines JSON-Parse-Utility für den Fallback

**Migration-Relevanz:** `data/` bleibt vom Skill unberührt, **aber** v2 könnte die Verzeichnisstruktur ändern (z.B. `data/sessions/<folder>/.claude/skills/` → `groups/<folder>/skills/` oder ähnlich). Nach Swap:
1. Prüfen, ob der alte Pfad noch existiert
2. Falls v2 einen neuen Pfad für User-Skills definiert: die 3 Dateien aus dem **Backup** (`/home/opj1claw/nanoclaw.v1-backup-2026-04-24/data/sessions/telegram_main/.claude/skills/yt-transcript/`) an die neue Stelle kopieren, Owner setzen, `browser-fetch.sh` executable lassen
3. `SKILL.md` frontmatter auf v2-Skill-Format prüfen (allowed-tools-Schema ggf. leicht anders)

## 5. YouTube-Cookies

**Pfad:** `/home/opj1claw/nanoclaw/secrets/youtube-cookies.txt` (`chmod 600`, `opj1claw:opj1claw`, Netscape-Format)

Bleibt unverändert beim Swap (ist in `.gitignore`). Mount nach `/workspace/extra/youtube-cookies.txt` via `container_config.additionalMounts` in `store/messages.db` — siehe Section 12.

## 6. Container-Konfiguration in der DB

**Pfad:** `store/messages.db` (SQLite)

Tabelle `registered_groups` enthält `container_config` als JSON-Blob pro Gruppe. Für `telegram_main` aktuell:

```json
{
  "additionalMounts": [
    { "hostPath": "/opt/shared",                                            "containerPath": "shared",              "readonly": true  },
    { "hostPath": "/home/memex/memex",                                       "containerPath": "memex",               "readonly": false },
    { "hostPath": "/home/opj1claw/nanoclaw/secrets/youtube-cookies.txt",     "containerPath": "youtube-cookies.txt", "readonly": true  }
  ]
}
```

Alle landen in `/workspace/extra/…` im Container (Mount-Security).

**Migration-Relevanz:** Diese Config überlebt den Code-Swap (DB wird nicht angefasst). Aber Schema der DB kann sich v1→v2 ändern — siehe Section 12.

## 7. Verifikations-Liste nach Phase 2

Nach dem Swap und Service-Restart, **bevor** der Bot als funktional gilt:

- [ ] systemd-Unit `opj1-nanoclaw.service` startet ohne Fehler (`journalctl -u opj1-nanoclaw -n 30`)
- [ ] `data/sessions/telegram_main/.claude/settings.json` enthält `LAST30DAYS_CONFIG_DIR` (wiederherstellen falls weg)
- [ ] `data/sessions/telegram_main/.claude/skills/yt-transcript/` enthält alle 3 Dateien mit richtigen Owners/Rechten (aus Backup ziehen falls weg)
- [ ] `groups/global/config/last30days/.env` mit allen 5 Keys vorhanden, chmod 600
- [ ] `secrets/youtube-cookies.txt` noch da, chmod 600
- [ ] Telegram-Smoke: `/chatid` an @MontjoieOG77_bot → Antwort
- [ ] last30days-Smoke: Topic-Query liefert Metadaten (SC-Fallback greift, yt-dlp kann scheitern)
- [ ] yt-transcript-Smoke: öffentliches YouTube-Video → Gemini-Zusammenfassung
