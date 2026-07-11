# NanoClaw Migration Guide

Generated: 2026-07-11
Base: 2afbd1823356a610302cc13e95f87204d3413d43
HEAD at generation: 47c46a5f (branch fix/compaction-validator-false-positive-resend)
Upstream: upstream/main as fetched 2026-07-11 (181 commits ahead of Base)

## Upgrade applied (2026-07-11)

Upgrade completed. New HEAD: `cab278b5` (upstream/main base `a30547fb`, package.json
version 2.1.46). Backup tag/branch: `pre-migrate-845add3d-20260711-102412`. All
customizations above were reapplied in a worktree, validated (773/773 host tests,
139/139 container tests, clean tsc build), committed, and swapped into the main
branch. See git log for the exact reapply commit (`cab278b5`).

## Migration Plan

Tier 3 (Complex) — begründet in `/root/.claude/plans/plane-das-nanoclaw-update-snug-rivest.md`.
Aufklärungs-Dry-Run (`git merge upstream/main --no-commit --no-ff`, verworfen) bestätigte
exakt 6 textuelle Konflikte: `CLAUDE.md`, `container/agent-runner/src/mcp-tools/scheduling.ts`
(modify/delete), `container/agent-runner/src/providers/index.ts`, `container/cli-tools.json`,
`setup/channels/slack.ts` (modify/delete), `setup/channels/whatsapp.ts` (modify/delete) —
plus einen stillen (nicht als Git-Konflikt gemeldeten) Fund: doppelter `migration019`-Identifier
in `src/db/migrations/index.ts`.

**Reihenfolge im Upgrade (Phase 2):**
1. Skills reapplien (add-deltachat u.a. — additiv, kein Risiko)
2. Scheduling-Semantik-Migration (Risikobereich — echte Portierung, kein Copy-Paste)
3. Migrations-Nummern-Kollision beheben (sonst bricht `tsc`, nicht `git`)
4. Providers/cli-tools/CLAUDE.md/setup-channels — mechanische Konflikte
5. container-runner.ts (OneCLI + Calendar + NO_PROXY + Env-Denylist) — additiver Block, kein Konflikt erwartet, aber nach Reapply verifizieren (upstream hat `execSync`→`execAsync` in derselben Datei geändert)
6. Delta-Chat Display-Chunking-Patch (nach Skill-Reapply, on top)
7. philosophie-feed-Skill kopieren

**Risikobereich:** Punkt 2 (Scheduling) — kein Git-Konflikt, aber funktionale Regression
falls übersehen (`now`/`deliveredAt` fehlen sonst kommentarlos im neuen Task-Format).

**Bekannte Nicht-Themen (bewusst nicht migrieren):** Upstream hat einen neuen Skill
`add-clidash` — kein Upstream-Pendant-Bedarf unsererseits, nicht übernehmen (kein
Auftrag von Oliver dafür, kein bestehender lokaler Nutzen).

## Applied Skills

Wird per `/add-<name>`-eigenem Apply auf dem Upstream-Worktree reapplied (additiv,
fetch aus `origin/<branch>`):

- `add-deltachat` (Delta-Chat-Channel — Basis-Adapter; OPJ1-Customizations siehe unten)
- Alle anderen `add-*`-Skills im Repo, sofern seit Base benutzt (per Sub-Agent-Exploration
  bestätigt: außer `add-deltachat` keine mit signifikantem Diff seit Base identifiziert;
  bei Zweifel während Phase 2.4 pro Skill `git diff <base>..HEAD -- .claude/skills/<name>/`
  prüfen, bevor reapplied wird)

Custom-Skill (kein Upstream-Pendant): `.claude/skills/philosophie-feed/` — 1:1 aus dem
Haupt-Baum kopieren, nicht über einen Skill-Apply-Mechanismus.

## Skill Interactions

Keine bekannten Konflikte zwischen den installierten Skills — `add-deltachat` ist der
einzige mit substanziellem lokalem Diff, und der betrifft ausschließlich Delta-Chat-
eigene Dateien (`src/channels/deltachat.ts`, `deltachat.test.ts`), keine Überschneidung
mit anderen Skills.

## Modifications to Applied Skills

### add-deltachat: Display-Lines-Chunking-Fix

**Intent:** Delta-Chat truncatet Nachrichten mit vielen kurzen Zeilen (Listen, Absätze)
serverseitig bei ca. 3800 Zeichen ODER ca. 38 Display-Zeilen — je nachdem was zuerst
greift. Der Skill-Standard chunked nur nach Zeichen-Limit, was bei "viele kurze
Zeilen"-Nachrichten (z.B. Listen) trotzdem zur Truncation führte, weil das
Zeilen-Limit vorher greift. Commit `2a7a48a9` (21.06.2026) behebt das mit einem
zusätzlichen Zeilen-Budget.

**Datei:** `src/channels/deltachat.ts` (nach Skill-Reapply von `origin/channels` reapplien)

**How to apply:**

1. Konstanten anpassen/ergänzen:
   ```typescript
   const DELTACHAT_CHUNK_MAX = 3000;   // Skill-Standard: 2000 — erhöht, bleibt unter DC-Truncation-Grenze
   const DELTACHAT_MAX_LINES = 34;     // neu — Delta-Chat zeigt ~38 Zeilen (DC_DESIRED_TEXT_LINES), Puffer
   const DELTACHAT_LINE_LEN = 100;     // neu — Chars pro Display-Zeile (Delta-Chat intern)
   ```
2. `chunkText(text, limit)` → `chunkText(text, limit, maxLines?)`:
   - Alte Logik: bricht nur nach `rest.lastIndexOf('\n', limit)`.
   - Neue Logik: `splitLongLine()` + `displayLines()`-Helper zählen Display-Zeilen
     (lange Zeilen werden nach `DELTACHAT_LINE_LEN` virtuell umgebrochen), Chunking
     packt Text-Atome bis entweder Zeichen- ODER Zeilen-Limit erreicht ist.
   - `sendText()`-Aufrufer entsprechend auf die neue Signatur anpassen.
3. Test-Datei `src/channels/deltachat.test.ts` (falls vom Skill-Standard nicht mitgebracht)
   aus dem aktuellen Baum kopieren — 81 Zeilen Vitest, deckt die neuen Chunking-Fälle ab.

**Verifikation nach Reapply:** `pnpm test -- deltachat` grün.

## Customizations

### Scheduling: current-time-Anchor + deliveredAt im Task-Format (Patch 595f9fad)

**Intent:** Ohne einen `now`-Anker im `<context>`-Tag rät der Agent die aktuelle Zeit
aus der Konversation — führte zu zwei Fehleinschätzungen (spät zugestellte Cron-Tasks
falsch eingeordnet, falsche Tageszeit genannt). `deliveredAt` im `<task>`-Tag
unterscheidet tatsächliche Zustellung von der DB-Insert-Zeit.

**Upstream-Kontext (per Sub-Agent-Analyse + eigener Verifikation):** Upstream hat
das Scheduling architektonisch umgebaut (Tasks-Control-Plane, `ncl tasks`-CLI,
`container/agent-runner/src/mcp-tools/scheduling.ts` gelöscht — siehe offizielles
Upgrade-Dokument `docs/ncl-tasks-migration.md`). **Wichtig, kein TODO mehr:**
Bestehende, vor dem Update angelegte Tasks laufen unverändert in ihrer Chat-Session
weiter — keine Zwangs-Datenmigration nötig. Der `now`/`deliveredAt`-Patch selbst
bleibt aber nötig und **einfach reapplybar**, weil `formatter.ts` (die Datei, die
beide Tags rendert) im neuen System strukturell gleich geblieben ist, nur ohne
unsere zwei Attribute.

**Dateien:** `container/agent-runner/src/formatter.ts`,
`container/agent-runner/src/compact-instructions.ts`,
`container/agent-runner/src/formatter.test.ts`

**Nicht mehr relevant:** `container/agent-runner/src/mcp-tools/scheduling.ts` — von
upstream gelöscht, unser lokaler Patch-Anteil dort ist obsolet, Datei beim Replay
nicht wiederherstellen.

**How to apply** (upstream-Stand von `formatter.ts` als Basis, verifiziert per
`git show upstream/main:container/agent-runner/src/formatter.ts`):

1. In `formatMessages()`, Zeile mit dem `<context>`-Header (aktuell:
   `` `<context timezone="${escapeXml(TIMEZONE)}" />\n` ``) ersetzen durch:
   ```typescript
   const now = formatLocalTime(new Date().toISOString(), TIMEZONE);
   const header = `<context timezone="${escapeXml(TIMEZONE)}" now="${escapeXml(now)}" />\n`;
   ```
2. `formatTaskMessage()` hat aktuell die Signatur `(msg: MessageInRow): string` und
   rendert `` `<task${from} time="${escapeXml(time)}">${parts.join('\n')}</task>` ``.
   Ändern zu:
   ```typescript
   function formatTaskMessage(msg: MessageInRow, deliveredAt: string): string {
     // ...unverändert bis zum return...
     return `<task${from} time="${escapeXml(time)}" deliveredAt="${escapeXml(deliveredAt)}">${parts.join('\n')}</task>`;
   }
   ```
   Aufrufer (`taskMessages.map(...)`) auf den zusätzlichen `now`-Parameter erweitern.
3. In `compact-instructions.ts`, Zeile 22: `'   - <task from="..." time="..."> for scheduled tasks',`
   → `'   - <task from="..." time="..." deliveredAt="..."> for scheduled tasks',`
   (reiner Doku-String, keine Logik).
4. `formatter.test.ts`: bestehende Test-Ergänzungen aus Commit `595f9fad` (Diff
   `git show 595f9fad -- container/agent-runner/src/formatter.test.ts`) auf die neue
   Funktionssignatur anpassen und reapplien.

**Verifikation nach Reapply:** `pnpm test -- formatter` grün, danach der in Plan-Schritt 7
vorgesehene Live-Test (echter Task-Roundtrip, `deliveredAt` im gerenderten Tag prüfen).

### Providers: lokale codex/opencode-Provider behalten, mock.js wie upstream entfernen

**Intent:** Zwei zusätzliche LLM-Provider (codex, opencode) für OPJ1 bereitstellen.
Upstream hat im selben Zeitraum das Mock-Provider-Modul entfernt (Architektur-
Vereinfachung, keine Kollision mit unserem Bedarf).

**Datei:** `container/agent-runner/src/providers/index.ts`

**How to apply:**
```typescript
import './claude.js';
import './codex.js';
import './opencode.js';
```
(kein `./mock.js` — wie upstream)

**Nebenbefund (nicht dieser Datei, sondern `providers/claude.ts`):** Upstream hat die
`rate_limit_event`-Erkennung von `message.type === 'system' && subtype === 'rate_limit_event'`
auf `message.type === 'rate_limit_event'` (Top-Level) geändert — vermutlich SDK-Update.
Dieser Merge läuft im Dry-Run konfliktfrei durch, ist aber ein **stiller Dead-Code-Risiko-
Punkt**: nach dem Replay verifizieren, dass unsere Rate-Limit-Behandlung noch die
neue (Top-Level-)Bedingung nutzt, nicht die alte verschachtelte.

### cli-tools.json: Versions-Bump kombinieren

**Intent:** Upstream pinnt eine neuere `@anthropic-ai/claude-code`-Version, wir haben
zusätzlich `opencode-ai` und `@openai/codex` als eigene Einträge.

**Datei:** `container/cli-tools.json`

**How to apply:** Beide Änderungen kombinieren — upstreams neuen `claude-code`-Versions-Pin
übernehmen, unsere `opencode-ai`/`@openai/codex`-Einträge zusätzlich behalten (exakte
Versionsnummern beim Reapply aus dem dann aktuellen `upstream/main`-Stand von
`cli-tools.json` übernehmen, nicht aus diesem Guide fest verdrahten — Upstream kann
zwischen Extract und Upgrade weitergezogen sein).

### CLAUDE.md → Upstream-Version übernehmen

**Intent:** Kein lokaler Sonderinhalt, der über eine reine Merge-Übernahme hinausgeht.

**How to apply:** Upstream-Version 1:1 übernehmen.

### setup/channels/slack.ts + whatsapp.ts → gelöscht lassen

**Intent:** Slack/WhatsApp sind bei uns nicht installiert (bewusst entfernt in einem
früheren Cleanup). Upstream bringt beide Dateien wieder mit (modify/delete-Konflikt
im Dry-Run bestätigt).

**How to apply:** Dateien im Upgrade-Worktree nicht wiederherstellen (`git rm` falls
sie durch den Worktree-Checkout wieder auftauchen).

### container-runner.ts: OneCLI-Provider-Marker + Calendar + NO_PROXY + Env-Denylist

**Intent:** Vier additive lokale Erweiterungen ohne Upstream-Pendant, alle im selben
Bereich der Funktion, die die `docker run`-Argumente für den Agent-Container baut:
1. `CALENDAR_ICAL_URL`-Passthrough
2. `SKILL_FORWARD_ENV` (komma-separierte Var-Namen → `-e NAME` an `docker run`,
   Zweck: Skill-seitige Provider-Detection sieht truthy String, OneCLI-Gateway
   überschreibt den echten Wert per Header-Injection — siehe PROJECT_STATUS.md)
3. `NO_PROXY`-Whitelisting für Host-Services
4. Pro-Agent-Group Env-Overrides mit Proxy/Cert-Denylist

**Datei:** `src/container-runner.ts`

**Ankerpunkt:** direkt nach `args.push('-e', \`TZ=${TIMEZONE}\`);`, vor dem Block
"Provider-contributed env vars" (upstream-Kommentar).

**How to apply:** Block 1:1 aus dem aktuellen `HEAD`-Stand von `src/container-runner.ts`
übernehmen (Diff-Basis: `git diff 2afbd182..HEAD -- src/container-runner.ts`) und an
obigem Ankerpunkt im Upstream-Worktree einfügen.

**Kein Konflikt erwartet** (Dry-Run-Merge lief hier sauber durch), aber **Verifikation
nötig**: Upstream hat in derselben Datei `buildAgentGroupImage()` von `execSync()` auf
`await execAsync()` umgestellt und globale Memory-Directory-Mount-Logik entfernt — beides
in anderen Funktionsbereichen, sollte unseren additiven Block nicht berühren. Nach Reapply
`tsc --noEmit` und einen echten Container-Spawn testen.

### Migrations-Nummern-Kollision: container-config-env auf Slot 020 verschieben

**Intent:** Lokale DB-Migration für das `env`-Feld in Container-Configs (ursprünglich
Slot 016, dann 017, dann 019 — kollidiert jetzt erneut, da Upstream Slot 019 für
`wiring-threads-override` vergeben hat). Wiederkehrendes Muster bei jedem Update
(siehe OpenBrain #410) — git meldet dabei **keinen** Konflikt, `tsc` bricht erst auf
doppeltem `migration019`-Import.

**Dateien:** `src/db/migrations/019-container-config-env.ts` (umbenennen),
`src/db/migrations/index.ts`

**How to apply:**
1. `019-container-config-env.ts` → `020-container-config-env.ts` umbenennen.
2. In der Datei: `export const migration019` → `export const migration020`,
   `version: 19` → `version: 20`. **`name: 'container-config-env'` NICHT ändern**
   (Runner dedupliziert über `name`, nicht `version` — Re-Migration sonst möglich).
3. In `src/db/migrations/index.ts`: Import-Zeile und Array-Eintrag von `migration019`
   auf `migration020` ändern (Slot 020 ist zum Zeitpunkt der Extract-Analyse auf
   beiden Seiten frei — beim tatsächlichen Upgrade erneut verifizieren, falls
   Upstream zwischenzeitlich weitergezogen ist).

### philosophie-feed: Custom-Skill ohne Upstream-Pendant

**Intent:** Eigener Skill, kein `add-*`-Upstream-Skill.

**How to apply:** `.claude/skills/philosophie-feed/` unverändert aus dem Haupt-Baum
in den Upgrade-Worktree kopieren.

## Offene TODOs für die Upgrade-Phase (nicht in dieser Extract-Phase geklärt)

- Nach dem Replay `docs/ncl-tasks-migration.md`-Abschnitt "Rollback" beachten, falls
  ein Rollback nötig wird UND zwischenzeitlich neue Tasks über `ncl tasks` angelegt
  wurden: erst diese Tasks löschen, einen Sweep (≤60s) abwarten, dann erst zurücksetzen
  — sonst bleiben verwaiste System-Sessions zurück, die alte Session-Auflösung
  fehlinterpretieren kann.
- Vor dem Live-Test-Smoke-Kriterium (Plan-Schritt 7) prüfen, ob der Umbau eine
  DB-Schema-Migration mitbringt, die über die reine `container-config-env`-Umnummerierung
  hinausgeht (Plan-Schritt 5) — in der Extract-Phase nicht abschließend geklärt.
- `providers/claude.ts` `rate_limit_event`-Bedingung nach Replay verifizieren (siehe oben).
