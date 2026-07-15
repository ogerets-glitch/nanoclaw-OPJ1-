# Teach-Skill-Installation fuer Hermes und NanoClaw

- goal: Den Upstream-Skill `teach` vollstaendig und unveraendert fuer Hermes Agent und NanoClaw bereitstellen. NanoClaws Hauptagent OPJ1 soll ihn explizit verwenden koennen; beide laufenden Systeme werden nach der Installation verifiziert.
- decisions: Der vollstaendige Upstream-Ordner wird installiert, weil `SKILL.md` vier Formatvorlagen referenziert. NanoClaws feste OPJ1-Skill-Liste wird nur um `teach` erweitert; sie wird nicht auf `all` umgestellt. Kein Docker-Rebuild und kein Git-Push.
- open_questions: Keine.
- constraints: Keine Secrets oder personenbezogenen Daten ausgeben. Hermes-Dateien muessen `hermesagent:hermesagent`, NanoClaw-Dateien `opj1claw:opj1claw` gehoeren. Vor der NanoClaw-DB-Aenderung ein konsistentes Backup erstellen. Nur der Hermes-Service und die OPJ1-Agentengruppe duerfen neu gestartet werden.

### T1: Hermes-Skill installieren
- depends_on: []
- location: /home/hermesagent/.hermes/skills/productivity/teach
- description: Vollstaendigen Upstream-Skill installieren und Eigentum sowie Berechtigungen korrigieren.
- validation: `hermes skills list` und Dateivergleich gegen Upstream
- status: Completed
- next_action: Keine.
- evidence: `hermes skills list` meldet `teach | productivity | local | enabled`; sechs Dateien und zwei Verzeichnisse gehoeren `hermesagent:hermesagent`.
- blocker:
- rollback: Verzeichnis `/home/hermesagent/.hermes/skills/productivity/teach` entfernen.
- files: /home/hermesagent/.hermes/skills/productivity/teach/**
- executor: codex
- reviewers: [codex]
- updated_at: 2026-07-16

### T2: NanoClaw-Skill installieren
- depends_on: []
- location: /home/opj1claw/nanoclaw/container/skills/teach
- description: Vollstaendigen Upstream-Skill als getrackte NanoClaw-Dateien installieren.
- validation: `git diff --check`, Upstream-Dateivergleich und NanoClaw-Tests
- status: Completed
- next_action: Keine.
- evidence: Vollstaendiger Sechs-Dateien-Ordner installiert; `diff -qr` gegen Hermes-Install ohne Abweichung; Eigentum `opj1claw:opj1claw`.
- blocker:
- rollback: Installations-Commit revertieren.
- files: container/skills/teach/**
- executor: codex
- reviewers: [codex]
- updated_at: 2026-07-16

### T3: OPJ1-Skill-Auswahl aktivieren
- depends_on: [T2]
- location: /home/opj1claw/nanoclaw/data/v2.db
- description: Konsistentes DB-Backup erzeugen, `teach` atomar zur bestehenden festen Skill-Liste hinzufuegen und die OPJ1-Gruppe neu laden.
- validation: `ncl groups config get --id ag-1777053973937-w5v230 --json` und Symlink-Pruefung
- status: Completed
- next_action: Keine.
- evidence: Backup `data/v2.db.bak-20260716-003036` mit `integrity_check=ok` und Modus 600; atomare Aenderung `changes()=1`; `ncl groups config get` zeigt `teach`; Gruppen-Restart meldet `ok=true, restarted=0, rebuilt=false`.
- blocker:
- rollback: DB-Backup zurueckspielen und OPJ1-Gruppe erneut starten.
- files: data/v2.db (runtime, gitignored), groups/telegram_main/container.json (materialisiert, gitignored)
- executor: codex
- reviewers: [codex]
- updated_at: 2026-07-16

### T4: Services und Installation verifizieren
- depends_on: [T1, T2, T3]
- location: Hermes- und NanoClaw-Laufzeit
- description: Hermes-Gateway neu starten, Logs und Skill-Erkennung pruefen sowie NanoClaw-Diff, Tests, Ownership und Laufzeitstatus kontrollieren.
- validation: Service-Status, Journal-Auszug, Skill-Listen, Checksummen, `pnpm test`, `pnpm lint`, `pnpm typecheck`
- status: Completed
- next_action: Keine.
- evidence: Hermes und NanoClaw `active`; Hermes meldet `teach | productivity | local | enabled`; beide Installationen sind ohne Diff und haben korrekte Eigentumer/Rechte; NanoClaw 84/84 Testdateien und 798/798 Tests bestanden; Typecheck bestanden; `src` seit Vorher-Commit unveraendert. Lint zeigt 12 bestehende Fehler im unveraenderten `src`-Bestand.
- blocker:
- rollback: T1 bis T3 gemaess jeweiligem Rollback zuruecknehmen.
- files: .plan/teach-skill-install-plan.md
- executor: codex
- reviewers: [codex]
- updated_at: 2026-07-16
