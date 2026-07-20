# NanoClaw-MCPs fuer OPJ1 wiederherstellen

- goal: OPJ1 erhaelt Arbeitsmarkt, Rechtsrecherche und Location zusaetzlich zu OpenBrain als URL-only-MCPs. Builder und SkillEditor bleiben unveraendert.
- decisions: Ausschliesslich das unterstuetzte `ncl`-CLI nutzen; keine Header oder Keys speichern, weil OneCLI bestehende Secrets injiziert; kein Image-Build und kein systemd-Neustart.
- open_questions: Keine; der Implementierungsplan ist bestaetigt.
- constraints: Keine Standortdaten abrufen oder protokollieren; OPJ1 nur im Leerlauf neu starten; keine Secrets, Vault-Aenderungen oder Pushes; fremde Arbeitsbaum-Aenderungen unveraendert lassen.

### T1: Live-Zustand und Rollback sichern
- depends_on: []
- location: /home/opj1claw/nanoclaw
- description: Git-, DB-, Agent-, Container- und Service-Zustand pruefen; konsistentes SQLite-Online-Backup mit Modus 600 und Integritaetscheck erstellen.
- validation: `PRAGMA integrity_check` auf dem Backup, Ownership und Modus pruefen.
- status: Completed
- next_action: T2 ausfuehren.
- rollback: Keine Laufzeitaenderung in diesem Task.
- evidence: Online-Backup `data/v2.db.bak-20260720-232119`; `PRAGMA integrity_check` = `ok`; `opj1claw:opj1claw`, Modus 600.
- files: data/v2.db.bak-20260720-232119
- executor: codex
- updated_at: 2026-07-20

### T2: Drei URL-only-MCPs fuer OPJ1 eintragen
- depends_on: [T1]
- location: data/v2.db
- description: Vor jedem CLI-Aufruf Namenskollision ausschliessen und `arbeitsmarkt`, `rechtsrecherche`, `location` ohne Header fuer OPJ1 eintragen.
- validation: DB-Readback zeigt exakt openbrain plus die drei neuen MCPs; Builder und SkillEditor unveraendert.
- status: Completed
- next_action: T3 ausfuehren.
- evidence: Vor jedem Eintrag war der Name abwesend; `ncl` hat `arbeitsmarkt`, `rechtsrecherche` und `location` URL-only mit leeren Header-Objekten angelegt. DB-Readback: OPJ1 exakt vier MCPs; Builder und SkillEditor weiterhin nur OpenBrain.
- rollback: Drei neue Eintraege mit `ncl groups config remove-mcp-server` entfernen.
- files: data/v2.db
- executor: codex
- updated_at: 2026-07-20

### T3: OPJ1 im Leerlauf neu starten und MCPs live pruefen
- depends_on: [T2]
- location: NanoClaw-Laufzeit
- description: Verarbeitung ausschliessen, nur OPJ1 neu starten, bei Bedarf einen einmaligen internen Testlauf ausloesen und danach dessen Testaufgabe entfernen.
- validation: Materialisiertes container.json, Runner-Startlog, SDK-Toolinventar, OneCLI-HTTP-200/Injektion und sichere MCP-Smokes.
- status: Completed
- next_action: T4 ausfuehren.
- evidence: Leerlauf vor Restart belegt; `ncl groups restart` meldete `restarted=1`, `rebuilt=false`; lokaler CLI-Test startete frischen Container. Runner meldet alle vier MCP-Namen. SDK-Inventar enthaelt alle vier Namensraeume; Arbeitsmarkt-Health und Rechtsrecherche-Health = ok; Location nur Inventar, kein Standortaufruf. OneCLI zeigt fuer alle drei neuen Hosts OPJ1-HTTP-200 mit `injections_applied=1`.
- rollback: T2 rueckgaengig machen und OPJ1 erneut starten.
- files: groups/telegram_main/container.json, data/v2-sessions/**
- executor: codex
- updated_at: 2026-07-20

### T4: Vollstaendig verifizieren und dokumentieren
- depends_on: [T3]
- location: NanoClaw-Repo und /opt/shared
- description: Host- und Runner-Checks, Service/Journal, Rechte, Diff/Secret-Check, PROJECT_STATUS und OpenBrain-Abschlussbericht erledigen; Plan archivieren.
- validation: Build, Tests, Typecheck, Lint, Format-Check, Runner-Tests/Typecheck sowie DoD-Selbstpruefung.
- status: Completed
- next_action: Keine; Plan archivieren und OpenBrain-Abschlussbericht speichern.
- evidence: Host: Build, Typecheck, Format und 798/798 Tests gruen; Lint weiterhin 12 vorbestehende Fehler, `git diff -- src` leer. Runner: Typecheck und im lastfreien Wiederholungslauf 176/176 Tests gruen. NanoClaw active/running, gleiche PID, NRestarts=0, keine neuen Journal-Warnungen. PROJECT_STATUS aktualisiert. Diff-Checks sauber; taskbezogener Secret-Scan ohne Befund; DB/Materialisierung exakt vier MCPs ohne Header oder Query-Secrets; Builder/SkillEditor unveraendert; Plan, Backup und container.json mit korrektem Eigentum/Rechten.
- rollback: Dokumentationsaenderungen revertieren; Laufzeit-Rollback gemaess T2/T3.
- files: /opt/shared/PROJECT_STATUS.md, .plan/archive/opj1-mcp-restore-plan.md
- executor: codex
- reviewers: [codex]
- updated_at: 2026-07-20
