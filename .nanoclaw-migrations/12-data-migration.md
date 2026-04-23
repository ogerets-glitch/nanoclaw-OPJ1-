# Daten-Migration v1 → v2

**Intent:** Beim v1→v2-Jump ändert upstream das DB-Schema und Teile der Datenstruktur in `groups/` und `store/`. Der `/migrate-nanoclaw`-Skill fasst diese Verzeichnisse **nicht** an — dafür gibt es einen separaten Code-Branch upstream: `feat/migrate-from-v1`.

## Wo liegen die Migrations-Skripte?

**Branch:** `upstream/feat/migrate-from-v1` (lokal verfügbar nach `git fetch upstream`)

Die Skripte liegen im Branch unter `setup/migrate-v1/`:
- `setup/migrate-v1/shared.ts` — gemeinsame Utilities (~729 Zeilen)
- `setup/migrate-v1/groups.ts` — Gruppen-Struktur migrieren (~230 Zeilen)
- `setup/migrate-v1/tasks.ts` — scheduled_tasks migrieren (~307 Zeilen)
- `setup/migrate-v1/validate.ts` — Validierung vor/nach Migration (~213 Zeilen)

Gesamt: 3055 Zeilen neu in 17 Dateien. Wird nach dem Merge in `main` als Befehl aufrufbar sein (genauer Befehl beim Checkout prüfen: `package.json → scripts.migrate-v1` o.ä.).

## Was migrieren die Skripte konkret?

Aus der Beobachtung vorhandener Commits im Branch (insbesondere `9faa8a9 fix(migrate-v1): splice guild_id into Discord platform_id during seed`):

- **Entity-Modell** wird transformiert — v1 hatte Privileges auf Channel-Ebene, v2 auf User-Ebene
- **`store/messages.db`** wird von einer einzelnen SQLite auf Dual-DB (`inbound.db` + `outbound.db`) umgebaut
- **`groups/<folder>/`** könnte umstrukturiert werden (Conversation-Dateien bleiben vermutlich, aber evtl. Meta-Files verändern sich)
- **scheduled_tasks** wird neu seriell gemacht
- **Channel-Identifier** (platform_id) werden für Multi-Provider-Support (Discord, Telegram) neu strukturiert

**Wichtig:** Die Migration ist **datenverändernd** auf Dateisystem-Ebene. Vorab-Backup ist Pflicht (siehe Section 0/Rollback).

## Wann ausführen?

**Nach dem Code-Swap** (Phase 2.8), **bevor** der Service gestartet wird:

```
Phase 2.6 — Build im Worktree
Phase 2.7 — Live-Test (optional, mit symlinked data/)
Phase 2.8 — Swap in Main-Tree
→ [HIER] setup/migrate-v1 Script ausführen (DB + groups/ transformieren)
Phase 2.9 — Service starten
```

**Nicht** vorher ausführen, weil die Skripte das v2-Schema erwarten und v1-Code auf migrierte Daten nicht mehr lesen kann.

## Ablauf

1. **Pre-flight:**
   - Service gestoppt (`systemctl stop opj1-nanoclaw.service`)
   - Externes Backup von `store/`, `groups/`, `data/` vorhanden (aus Section 0 / Rollback)
   - Im neuen v2-Tree: `npm install` (oder `bun install`) bereits gelaufen, Dependencies aufgelöst

2. **Validate vor Migration:**
   ```bash
   cd /home/opj1claw/nanoclaw
   sudo -u opj1claw npx tsx setup/migrate-v1/validate.ts --pre
   ```
   (Genauer Aufruf aus dem upstream-Branch prüfen — könnte `node --import tsx setup/...`, `bun setup/...` oder `npm run migrate-v1:validate` sein.)

3. **Migration laufen lassen:**
   ```bash
   sudo -u opj1claw npx tsx setup/migrate-v1/groups.ts
   sudo -u opj1claw npx tsx setup/migrate-v1/tasks.ts
   ```
   Output genau beobachten — bei Fehlern **sofort abbrechen**, Backup zurückspielen, debuggen.

4. **Validate nach Migration:**
   ```bash
   sudo -u opj1claw npx tsx setup/migrate-v1/validate.ts --post
   ```
   Sollte „all checks passed" o.ä. liefern.

5. **Service starten:**
   ```bash
   sudo systemctl start opj1-nanoclaw.service
   sudo journalctl -u opj1-nanoclaw -n 30 --no-pager
   ```

## Rollback-Szenario

Wenn die Daten-Migration schiefgeht:

1. `systemctl stop opj1-nanoclaw.service` (wenn schon gestartet)
2. **Code zurück** auf v1-Tag: `git reset --hard pre-migrate-<ts>` (siehe Phase 2.1)
3. **Daten zurück** aus Backup:
   ```bash
   sudo rsync -a --delete /home/opj1claw/nanoclaw.v1-backup-2026-04-24/store/   /home/opj1claw/nanoclaw/store/
   sudo rsync -a --delete /home/opj1claw/nanoclaw.v1-backup-2026-04-24/groups/  /home/opj1claw/nanoclaw/groups/
   sudo rsync -a --delete /home/opj1claw/nanoclaw.v1-backup-2026-04-24/data/    /home/opj1claw/nanoclaw/data/
   sudo chown -R opj1claw:opj1claw /home/opj1claw/nanoclaw/{store,groups,data}
   ```
4. `npm install && npm run build` im v1-Tree
5. `systemctl start opj1-nanoclaw.service`

## Was machen wir, wenn `feat/migrate-from-v1` beim Upgrade-Zeitpunkt noch nicht in `main` gemerged ist?

Aktueller Stand (2026-04-24):
- `upstream/feat/migrate-from-v1` existiert, ist aktiv (letzter Commit `a65ee2e Merge branch 'main'`)
- Noch nicht in `upstream/main` gemerged

Optionen bei Phase 2:
- **a)** Warten bis der Branch in `main` ist — sicherster Weg, dann ist der Migrations-Pfad offiziell supportet
- **b)** Den Branch direkt in unseren v2-Worktree mergen (`git merge upstream/feat/migrate-from-v1 --no-edit`) — funktioniert, wenn keine Konflikte; Risiko: Bugs, die noch nicht in `main` gefixt sind
- **c)** Auf v2 umsteigen ohne Daten-Migration — Daten bleiben in v1-Struktur, Bot kann sie evtl. nicht lesen → wahrscheinlich scheitert Service-Start → nicht empfohlen

**Empfehlung:** Vor Phase-2-Start prüfen, ob `feat/migrate-from-v1` in `main` ist. Wenn nicht: Oliver entscheidet zwischen (a) warten und (b) Branch direkt mergen. Default: (a).
