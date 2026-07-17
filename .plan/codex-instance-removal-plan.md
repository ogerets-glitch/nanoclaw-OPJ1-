# Plan: NanoClaw-Codex-Instanz ("OPJ1 Codex") vollständig entfernen

- goal: Die permanente NanoClaw-Agent-Gruppe "OPJ1 Codex" (provider codex, DeltaChat-Gruppe 12)
  ist redundant, seit Hermes ebenfalls auf Codex läuft (Oliver, 2026-07-17), und soll vollständig
  entfernt werden: NanoClaw-DB-Gruppe, Channel-Bindung, On-Disk-Daten, OneCLI-Agent-Token. Die
  Claude-Gruppe "OPJ1" bleibt unverändert und muss durchgehend erreichbar bleiben.
- decisions:
  - Scope "Vollständig sauber" statt "Minimal" oder "Rundum aufräumen" (Oliver, AskUserQuestion
    2026-07-17): DB+Bindung+On-Disk+OneCLI-Token weg; Codex-Image `gpt56sol-codex01441` bleibt
    als Rollback-Reserve; Vault-Secrets und die 3 Canary-Test-Agents (Codex MCP Canary, Codex
    Canary, Claude Canary) bleiben unangetastet (außerhalb Scope).
  - Löschung über `ncl groups delete --id <id>` statt manuellem SQL (Begründung: getesteter
    FK-Cascade, Regression-Test #2525, läuft durch den laufenden Daemon selbst — kein
    Service-Neustart, kein Stale-Cache-Risiko).
  - DB-Backup per SQLite Online-Backup-API (`sqlite3 ... ".backup ..."`), NICHT `cp` — die DB
    läuft im WAL-Modus, ein reines `cp` der Hauptdatei kann committeten WAL-Inhalt verpassen und
    wäre als Rollback-Basis inkonsistent (Codex-Plan-Review-Befund, 2026-07-17, 1 Runde).
  - Rollback-Primärweg ist ein gezielter Zeilen-Re-Import der wenigen gelöschten Codex-Zeilen,
    NICHT ein voller DB-Restore aus dem Online-Backup — ein voller Restore würde alle
    zwischenzeitlichen Änderungen der weiterlaufenden Claude-Gruppe seit dem Backup-Zeitpunkt
    mit vernichten (Codex-Plan-Review-Befund).
  - OneCLI-Agent-Löschung (S5) ist der letzte Schritt, nicht früher — er ist am schlechtesten
    rückrollbar (Token ist beim Neuanlegen nicht identisch wiederherstellbar).
- open_questions:
  - Kein CLI-Verb `ncl messaging-groups delete` bekannt/verifiziert — muss zur Laufzeit per
    `ncl messaging-groups help` geprüft werden; Fallback ist manuelles SQL (siehe T3).
  - Ob DeltaChat-Gruppe 12 nach Entfernen der Bindung bei neuer eingehender Nachricht als
    "unbekannter Sender" neu registriert wird (harmlos ohne Agent-Bindung, aber zu beobachten).
- constraints:
  - Alle Datei-/DB-Operationen als `opj1claw` (`sudo -u opj1claw`), NIEMALS als root.
  - Kein Repo-Code-Edit, kein systemd-Edit, keine Vault-Secret-Mutation, kein Anfassen von
    `:latest`-Image oder Canary-Agents.
  - OneCLI-Admin-Key (`/root/.onecli/admin-api-key.json`) nie als CLI-Argument, nie per
    echo/cat/print — nur aus der Datei programmatisch lesen (z. B. python), nie ins
    Transcript/Log.
  - Die laufende Claude-Gruppe (`ag-1777053973937-w5v230`, Container `telegram_main`) darf zu
    keinem Zeitpunkt gestoppt, migriert oder in der DB berührt werden.
  - Reihenfolge S0→S6 ist bindend (insb. S2b Spawn-Race-Check vor On-Disk-Löschung, S5 ganz
    zuletzt) — nicht umsortieren ohne neue Gegenprüfung.

## Verifizierter Ist-Zustand (read-only recherchiert, 2026-07-17)

**NanoClaw-DB (`/home/opj1claw/nanoclaw/data/v2.db`, WAL-Modus aktiv):**
- Zu löschende Gruppe: `agent_groups.id = a9e70f1c-4c4d-4fc6-be2f-db7e28007e58`,
  name "OPJ1 Codex", folder `opj1-codex`.
- `container_configs`: provider codex, model gpt-5.6-sol, image_tag
  `nanoclaw-agent-v2-67315674:gpt56sol-codex01441`.
- `messaging_group_agents.id = 1b42f36e-c091-4cbc-b660-abb558febb33` bindet die Gruppe an
  `messaging_groups.id = 552348fe-9e89-4021-90e4-e3f6f298ef84` (channel_type=deltachat,
  platform_id=`deltachat:group:12`, name "OPJ1 Codex"). Diese messaging_group ist **exklusiv**
  an Codex gebunden (die Claude-Gruppe nutzt andere messaging_groups, u. a.
  `mg-deltachat-oliver-11`).
- `sessions`: genau 1 Zeile mit `agent_group_id = a9e70f1c-…`.
- **On-Disk:** `groups/opj1-codex/` (AGENTS.md, container.json, conversations/, memory/) und
  `data/v2-sessions/a9e70f1c-4c4d-4fc6-be2f-db7e28007e58/`.
- **Bleibt unverändert:** `agent_groups.id = ag-1777053973937-w5v230` ("OPJ1", Claude,
  provider-Feld leer=Default-Claude-Provider, folder `telegram_main`), sowie Builder,
  SkillEditor, Infomaniak Test/Qwen (andere Provider, außerhalb Scope).

**Lösch-Werkzeug:** `ncl groups delete --id <id>` (`src/cli/resources/groups.ts:106`, Verb
`delete`, `access: 'approval'`) — FK-geordneter Cascade in EINER better-sqlite3-Transaktion
(Regression-Test in `src/cli/resources/groups.test.ts`, referenziert Issue #2525): löscht
`sessions`, `pending_questions`, `pending_approvals`, `agent_destinations`,
`pending_sender_approvals`, `pending_channel_approvals`, `messaging_group_agents`,
`agent_group_members`, `user_roles`, `container_configs`, dann `agent_groups`. **Laut
Docstring explizit out of scope:** laufende Container killen, On-Disk-Cleanup von
`groups/<folder>/` und `data/v2-sessions/<group-id>/`, sowie die `messaging_groups`-Zeile
selbst — das sind die manuellen Zusatzschritte T3/T4 unten.

Aufruf-Semantik (`src/cli/dispatch.ts:131`): Das Approval-Gate greift nur für
`ctx.caller !== 'host'` (Container-Agents). Ein Aufruf über `ncl` **als Host** (Socket des
laufenden NanoClaw-Daemons, `bin/ncl` → `pnpm exec tsx src/cli/client.ts`) läuft **inline ohne
Approval-Umweg** und wird vom laufenden Daemon selbst ausgeführt — kein Service-Neustart,
kein Stale-Cache-Risiko.

**OneCLI (Credential-Gateway, separates Postgres/Prisma-System, metadaten-only recherchiert):**
- Exklusiver Codex-Artefakt: Agent **"OPJ1 Codex"**, `id = b913da35-3ac2-44a5-b751-582c53c9b3c1`,
  `secretMode = all`. Sein Gateway-Token wurde nur vom Codex-Container genutzt.
- Hermes hat einen **eigenen** OneCLI-Agent: "Hermes Telegram", `id = 5b74beba-0c0d-4394-b99c-
  7b9ecff221f8`, `secretMode = selective` — nutzt `b913da35` nicht. (In T5 vor dem Löschen
  nochmal am System bestätigen, nicht nur aus dieser Notiz übernehmen.)
- `deleteAgent()` (`/opt/onecli/apps/web/src/lib/services/agent-service.ts:125`) löscht den
  Agent per `db.agent.delete` (Prisma-Cascade auf abhängige Zeilen), mit Guard
  `if (agent.isDefault) throw ...` — b913da35 ist nicht der Default-Agent.
- Route: `DELETE /api/agents/{agentId}` (`/opt/onecli/apps/web/src/app/api/agents/[agentId]/
  route.ts`), Auth über Admin-API-Key aus `/root/.onecli/admin-api-key.json`.
- **NICHT anfassen (geteilte Ressourcen — Löschen würde andere Bots brechen):**
  - Vault-Secret "Codex" (host `chatgpt.com`, `id = dbf76e55-b92b-482b-a89d-df7b1ac70547`) —
    wird jetzt von **Hermes** genutzt.
  - Alle Secrets mit Namenssuffix "(NanoClaw v2)" (OpenBrain, Arbeitsmarkt, Rechtsrecherche,
    Location, Exa, Parallel, xAI, OpenRouter, ScrapeCreators, Gemini, Anthropic) — generische,
    host-gematchte Secrets, die **jeder** `all`-Modus-NanoClaw-Agent automatisch injiziert
    bekommt (Architektur-Constraint: `all`-Modus matcht per Host, nicht per Agent-Link).
  - Das NanoClaw-Docker-Image `:latest` (wird von allen Gruppen inkl. Claude genutzt).
  - Die 3 verwaisten Canary-Test-Agents aus dem ursprünglichen Codex-Rollout (Codex MCP Canary,
    Codex Canary, Claude Canary) — außerhalb des Scopes dieser Aufgabe.

## Aufgaben

### T0: Pre-Check — Identität + laufende Container
- depends_on: []
- location: Host (VPS), `/home/opj1claw/nanoclaw`
- description: Vor jeder Mutation zweifach verifizieren, dass die richtige Gruppe getroffen
  wird, und sicherstellen, dass kein Codex-Container gerade läuft/spawnt.
  1. `sudo -u opj1claw sqlite3 data/v2.db "SELECT id,name,folder FROM agent_groups WHERE
     id IN ('a9e70f1c-4c4d-4fc6-be2f-db7e28007e58','ag-1777053973937-w5v230')"` — erwartet
     genau die zwei bekannten Namen ("OPJ1 Codex" / "OPJ1"), keine Abweichung.
  2. `docker ps -a --filter name=nanoclaw --format '{{.Names}}\t{{.Status}}'` — nur
     `telegram_main`-Container (Claude) darf laufen. Ein laufender Codex-Container (Name
     enthält typischerweise `opj1-codex` oder die Group-ID) wird mit `docker stop <name>`
     gestoppt.
- validation: Beide obigen Befehle liefern das erwartete Ergebnis; kein Codex-Container `Up`.
- status: Not Completed
- next_action: Beide Befehle ausführen, Output hier/in `evidence` festhalten, bei Abweichung
  STOP (Verifikations-Disziplin Regel 7) statt weiterzumachen.
- evidence:
- blocker:
- rollback: Kein Schreibzugriff in diesem Schritt (außer ggf. `docker stop`, das nur einen
  On-Demand-Container betrifft und keinen Datenverlust bedeutet).
- files: []
- executor: codex
- reviewers: []
- updated_at: 2026-07-17

### T1: Konsistente Backups (WAL-sicher)
- depends_on: [T0]
- location: `/home/opj1claw/nanoclaw/data/`
- description: Backups VOR jeder Mutation, alle als `opj1claw`, mode 600.
  1. **SQLite Online-Backup** (nicht `cp` — DB läuft im WAL-Modus, ein reines Datei-`cp` kann
     bereits committeten `-wal`-Inhalt verpassen und wäre als Rollback-Basis inkonsistent):
     `sudo -u opj1claw sqlite3 data/v2.db ".backup 'data/v2.db.bak-$(date +%Y%m%d-%H%M%S)-pre-
     codex-removal'"`.
  2. Auf der Sicherung `PRAGMA integrity_check;` (erwartet exakt `ok`) und stichprobenartig
     prüfen, dass beide Gruppen-IDs (`a9e70f1c-…`, `ag-1777053973937-w5v230`) in
     `agent_groups` enthalten sind.
  3. **Gezielter Zeilen-Export** der zu löschenden Codex-Zeilen (Rollback-Primärweg, siehe
     `decisions`): `SELECT`-Statements über `agent_groups`, `container_configs`,
     `messaging_group_agents`, `messaging_groups` (nur die 552348fe-Zeile),
     `sessions` (nur `agent_group_id = a9e70f1c-…`) nach `data/codex-rows-<ts>.sql` schreiben
     — als lesbare `INSERT`-Statements oder zumindest vollständige Zeilenwerte, nicht nur IDs.
  4. **On-Disk-tar:** `sudo -u opj1claw tar czf data/codex-instance-backup-<ts>.tar.gz
     groups/opj1-codex data/v2-sessions/a9e70f1c-4c4d-4fc6-be2f-db7e28007e58`, danach
     `tar tzf data/codex-instance-backup-<ts>.tar.gz` zur Sichtprüfung des Inhalts.
  5. Alle vier Artefakte: `chown opj1claw:opj1claw`, `chmod 600`.
- validation: `integrity_check` = `ok`; `tar tzf` zeigt beide erwarteten Pfade; alle
  Backup-Dateien owner opj1claw, mode 600.
- status: Not Completed
- next_action: Backup-Befehle in obiger Reihenfolge ausführen.
- evidence:
- blocker:
- rollback: n/a (dieser Task erzeugt nur die Rollback-Grundlage für alle folgenden Tasks).
- files: [data/v2.db.bak-*, data/codex-rows-*.sql, data/codex-instance-backup-*.tar.gz]
- executor: codex
- reviewers: []
- updated_at: 2026-07-17

### T2: DB-Gruppe löschen (getesteter Cascade) + Verifikation
- depends_on: [T1]
- location: `/home/opj1claw/nanoclaw`
- description:
  1. `sudo -u opj1claw ncl groups delete --id a9e70f1c-4c4d-4fc6-be2f-db7e28007e58` — als
     Host-Caller über den laufenden Daemon-Socket (kein Neustart nötig).
  2. Reale `removed`-Counts aus der Antwort zitieren (erwartet u. a. `container_configs=1`,
     `messaging_group_agents=1`, `sessions=1`, `agent_group_members`/`user_roles` ggf. 0).
  3. **Über die Counts hinaus verifizieren** (Codex-Plan-Review-Befund — Counts allein nicht
     als Beweis nehmen): gezielt bestätigen, dass keine Zeile mit `a9e70f1c-…` mehr in
     `agent_groups`, `container_configs`, `sessions`, `messaging_group_agents` existiert, plus
     `PRAGMA foreign_key_check;` (erwartet leeres Ergebnis).
  4. Bestätigen, dass die Claude-Gruppen-Zeilen (`ag-1777053973937-w5v230` und ihre
     `container_configs`/`messaging_group_agents`-Zeilen) unverändert sind.
- validation: Siehe Punkt 3+4 oben — konkrete SQL-Ausgaben zitieren (Willison-Grundsatz:
  kein "sollte funktioniert haben").
- status: Not Completed
- next_action: `ncl groups delete` ausführen, danach die 4 Verifikations-Queries.
- evidence:
- blocker:
- rollback: Zeilen aus `data/codex-rows-<ts>.sql` (T1) gezielt re-inserten — NICHT vollen
  DB-Restore aus dem Online-Backup nutzen (würde zwischenzeitliche Claude-Änderungen seit T1
  vernichten, siehe `decisions`).
- files: []
- executor: codex
- reviewers: []
- updated_at: 2026-07-17

### T3: Zweiter Container-Check (Spawn-Race)
- depends_on: [T2]
- location: Host (Docker)
- description: Zwischen T0 und T2 kann eine noch in Bearbeitung befindliche DeltaChat-Nachricht
  einen Codex-Container gestartet haben, der beim ersten Check (T0) noch nicht sichtbar war.
  `docker ps -a --filter name=nanoclaw --format '{{.Names}}\t{{.Status}}'` erneut ausführen.
  Falls ein Codex-Container (egal ob laufend oder bereits beendet) seit T0 neu erschienen ist:
  `docker stop`/`docker rm` bevor mit T4 fortgefahren wird — sonst könnten die in T4 gelöschten
  Session-Verzeichnisse unter einem noch aktiven Prozess wegbrechen.
- validation: `docker ps -a` zeigt keinen Codex-Container mehr (weder Up noch neu seit T0).
- status: Not Completed
- next_action: Befehl ausführen, Ergebnis mit T0-Stand vergleichen.
- evidence:
- blocker:
- rollback: n/a (nur Beobachtung + ggf. Container-Stop).
- files: []
- executor: codex
- reviewers: []
- updated_at: 2026-07-17

### T4: Verwaiste `messaging_groups`-Zeile entfernen
- depends_on: [T3]
- location: `/home/opj1claw/nanoclaw`
- description: `ncl groups delete` (T2) löscht die Bindungszeile in `messaging_group_agents`,
  lässt aber die `messaging_groups`-Zeile `552348fe-9e89-4021-90e4-e3f6f298ef84` selbst stehen.
  1. Bestätigen: kein `messaging_group_agents`-Eintrag zeigt mehr auf `552348fe-…`.
  2. **Vor jedem DELETE** (Codex-Plan-Review-Befund): Schema nach weiteren Tabellen mit einem
     Fremdschlüssel auf `messaging_groups.id` durchsuchen (`grep -rn 'messaging_group_id\|
     messaging_groups' src/db/ src/**/*.sql 2>/dev/null` bzw. `PRAGMA foreign_key_list(<table>)`
     für Kandidaten wie `unregistered_senders`, `pending_channel_approvals`,
     `chat_sdk_*`-Tabellen) — nur löschen, wenn wirklich referenzlos.
  3. `ncl messaging-groups help` ausführen: falls ein `delete`-Verb existiert, dieses nutzen
     (kennt die volle Lösch-Semantik). Sonst gezieltes
     `DELETE FROM messaging_groups WHERE id='552348fe-9e89-4021-90e4-e3f6f298ef84'`
     als `opj1claw` via sqlite3 (T1-Backup liegt vor).
  4. Hinweis für Doku (T6): Der DeltaChat-Kanal (Gruppe 12) besteht auf Olivers Gerät technisch
     weiter; ohne Agent-Bindung spawnt NanoClaw dort nichts mehr, könnte den Kanal aber bei
     einer neuen eingehenden Nachricht als "unbekannten Sender" neu registrieren (harmlos, da
     ohne Agent-Zuordnung keine Aktion folgt) — beobachten, nicht blockierend.
- validation: `SELECT * FROM messaging_groups WHERE id='552348fe-…'` liefert kein Ergebnis mehr;
  keine verwaisten Fremdschlüssel-Referenzen laut Schema-Grep.
- status: Not Completed
- next_action: Schema-Grep zuerst, dann `ncl messaging-groups help`, dann Löschweg wählen.
- evidence:
- blocker:
- rollback: Zeile aus `data/codex-rows-<ts>.sql` (T1) wieder einfügen.
- files: []
- executor: codex
- reviewers: []
- updated_at: 2026-07-17

### T5: On-Disk-Cleanup
- depends_on: [T3, T4]
- location: `/home/opj1claw/nanoclaw`
- description: Erst nach bestätigtem Backup (T1) UND bestätigtem zweiten Container-Check (T3).
  Vor dem `rm -rf`: `realpath groups/opj1-codex data/v2-sessions/a9e70f1c-…` prüfen (keine
  Symlinks auf unerwartete Ziele), Owner beider Pfade = `opj1claw` bestätigen, dann mit festen
  (nicht interpolierten/variablen) Pfaden löschen:
  `sudo -u opj1claw rm -rf groups/opj1-codex data/v2-sessions/a9e70f1c-4c4d-4fc6-be2f-db7e28007e58`.
- validation: Beide Pfade existieren nicht mehr (`ls` → "No such file or directory"); Backup
  aus T1 (`data/codex-instance-backup-*.tar.gz`) ist weiterhin vorhanden und lesbar.
- status: Not Completed
- next_action: realpath/Owner-Check, dann rm -rf mit den zwei festen Pfaden.
- evidence:
- blocker:
- rollback: `tar xzf data/codex-instance-backup-<ts>.tar.gz` (aus T1) entpackt beide
  Verzeichnisse an ihren Originalort zurück.
- files: [groups/opj1-codex/ (gelöscht), data/v2-sessions/a9e70f1c-…/ (gelöscht)]
- executor: codex
- reviewers: []
- updated_at: 2026-07-17

### T6: OneCLI-Agent-Token entfernen (letzter Schritt — schlechtester Rollback)
- depends_on: [T5]
- location: OneCLI (`/opt/onecli`, Dashboard-API `127.0.0.1:10254`)
- description: Dieser Schritt läuft bewusst zuletzt, weil er am schlechtesten rückrollbar ist
  (ein neu angelegter Agent bekommt eine neue ID und ein neues Token — nicht identisch zum
  alten `b913da35`).
  1. **Vorab am System bestätigen** (nicht nur aus dieser Notiz übernehmen): Hermes' OneCLI-
     Konfiguration/Token-Referenz zeigt auf Agent "Hermes Telegram" (`5b74beba-0c0d-4394-b99c-
     7b9ecff221f8`), NICHT auf `b913da35`. Metadaten-only prüfen (kein Token-Wert ausgeben).
  2. Metadaten des zu löschenden Agenten (id, name, secretMode — KEIN Token) als Rollback-
     Referenz notieren.
  3. `DELETE /api/agents/b913da35-3ac2-44a5-b751-582c53c9b3c1` mit dem Admin-API-Key aus
     `/root/.onecli/admin-api-key.json` (nur programmatisch aus der Datei gelesen, nie als
     CLI-Argument, nie per echo/cat/print, nie ins Log/Transcript). HTTP-2xx erwartet.
  4. `GET /api/agents` danach: "OPJ1 Codex"/`b913da35` ist weg; alle anderen Agents
     (insbesondere "Hermes Telegram", "NanoClaw v2 Bot (OPJ1)", "Kidbot", die Canary-Agents)
     unverändert vorhanden.
- validation: DELETE-Response HTTP 2xx; anschließender `GET /api/agents` bestätigt Entfernung
  und Unverändertheit aller anderen Agents.
- status: Not Completed
- next_action: Schritt 1 (Hermes-Bestätigung) zuerst, danach DELETE ausführen.
- evidence:
- blocker:
- rollback: Kein direkter Rollback möglich (Token nicht wiederherstellbar) — Agent müsste neu
  angelegt und in einer eventuellen Neuaufsetzung der Codex-Gruppe neu verdrahtet werden.
- files: []
- executor: codex
- reviewers: []
- updated_at: 2026-07-17

### T7: Verifikation + Doku
- depends_on: [T6]
- location: `/home/opj1claw/nanoclaw`, `/opt/shared/PROJECT_STATUS.md`
- description:
  1. Volle Definition-of-Done-Liste durchgehen (siehe unten) mit echtem Befehls-Output belegen.
  2. `journalctl -u <nanoclaw-systemd-unit> -n 20 --no-pager` (Unit-Namen vorher per
     `systemctl list-units | grep -i nanoclaw` ermitteln) — keine neuen Fehler seit T2.
  3. `/opt/shared/PROJECT_STATUS.md`: neuer datierter Eintrag (Codex-Instanz entfernt, Grund
     "Hermes läuft jetzt auch auf Codex", Scope "Vollständig sauber", Pfade der Backups aus T1,
     was bewusst erhalten blieb: Codex-Image `gpt56sol-codex01441`, alle Vault-Secrets,
     3 Canary-Agents, DeltaChat-Reimport-Hinweis aus T4). Nur diese eine Datei stagen/committen.
  4. Diesen Plan-Task (T7) sowie alle vorherigen mit `status: Completed` und echter `evidence`
     versehen, committen.
- validation: Alle DoD-Punkte unten grün mit zitiertem Output; PROJECT_STATUS.md committet.
- status: Not Completed
- next_action: Nach T6 abschließend alle Prüfpunkte durchgehen und dokumentieren.
- evidence:
- blocker:
- rollback: n/a (reine Verifikation/Doku).
- files: [/opt/shared/PROJECT_STATUS.md]
- executor: codex
- reviewers: []
- updated_at: 2026-07-17

## Definition of Done (Referenz für T7)
- `agent_groups`: "OPJ1 Codex" weg; OPJ1/Builder/SkillEditor/Infomaniak Test/Qwen unverändert.
- `PRAGMA foreign_key_check` leer.
- Keine `messaging_group_agents`/`messaging_groups`-Zeile mehr für Codex/`deltachat:group:12`.
- On-Disk: `groups/opj1-codex` + `data/v2-sessions/a9e70f1c-…` existieren nicht mehr; alle
  Backups aus T1 vorhanden, owner opj1claw, mode 600.
- OneCLI `/api/agents`: "OPJ1 Codex" (b913da35) weg; Hermes/OPJ1/Kidbot/Canary-Agents
  unverändert.
- NanoClaw-Service läuft weiter, keine neuen Fehler im Journal; laufender Claude-Container
  (`telegram_main`) durchgehend up.
- Vault unangetastet: `Codex|chatgpt.com` + alle `(NanoClaw v2)`-Secrets unverändert (Hermes
  weiterhin funktionsfähig).
- Optional (Oliver, nicht blockierend): Live-Test — DeltaChat-Gruppe 12 antwortet nicht mehr;
  Hermes (Telegram, Codex) und Claude-OPJ1 (Telegram) antworten weiter normal.

## Constraints / Rollback (Gesamtübersicht)
- Nur die Codex-Gruppe/ihre Artefakte werden verändert. Keine Vault-Secret-Mutation, kein
  `:latest`-Image, keine Canary-Agents, kein systemd-Edit, kein Repo-Code-Edit.
- Alle Datei-/DB-Operationen als `opj1claw` (`sudo -u opj1claw`), niemals als root.
- Rollback-Reihenfolge bei Abbruch: zuerst prüfen, wie weit T1–T6 gekommen sind (`status`-Felder
  oben), dann gezielt die betroffenen Zeilen/Dateien aus den T1-Backups zurückspielen — **kein**
  automatischer voller DB-Restore (würde parallele Claude-Gruppen-Aktivität seit T1 vernichten).
- Diese Aufgabe wurde von Oliver freigegeben (AskUserQuestion 2026-07-17, Scope "Vollständig
  sauber") und ist Codex-plan-gegengeprüft (1 Runde, alle Einwände oben in `decisions`
  eingearbeitet: WAL-Backup, Spawn-Race, FK-Prüfung vor `messaging_groups`-DELETE,
  differenzierter Rollback, OneCLI-Löschung zuletzt).
