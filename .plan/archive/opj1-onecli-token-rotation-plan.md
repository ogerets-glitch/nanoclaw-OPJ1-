# OPJ1-OneCLI-Agent-Token rotieren

- goal: Den im Transcript exponierten OneCLI-Proxy-Token des aktuellen OPJ1-Agenten sicher invalidieren und alle OPJ1-Sessions auf einen frischen Token umstellen.
- decisions: Nur den OneCLI-Agenten `OPJ1` mit Identifier `ag-1777053973937-w5v230` rotieren; alle anderen OneCLI-Agenten haben eigene Tokens und bleiben unveraendert. Kein Klartext-Token wird gespeichert oder ausgegeben. Nach der Rotation wird OPJ1 gruppenweit neu geladen und intern getestet.
- open_questions: Keine; Oliver hat den Plan am 21.07.2026 bestaetigt.
- constraints: Rotation erst nach Leerlaufcheck; keine Vault-Secret-, Image- oder systemd-Aenderung; keine rohen Prozessargumente; kein Push.

### T1: Verbraucher und Leerlauf final pruefen
- depends_on: []
- location: OneCLI und /home/opj1claw/nanoclaw
- description: Exakte Agentenidentitaet, getrennte Tokens der anderen Instanzen und alle OPJ1-Container/Sessions pruefen.
- validation: OneCLI-Agent-ID/Identifier eindeutig; kein OPJ1-Container verarbeitet eine Nachricht.
- status: Complete
- next_action: Abgeschlossen; kein laufender OPJ1-Container, Agent eindeutig.
- rollback: Keine Mutation.
- files: .plan/opj1-onecli-token-rotation-plan.md
- executor: codex
- updated_at: 2026-07-21

### T2: OPJ1-Agent-Token rotieren
- depends_on: [T1]
- location: OneCLI-Agent 66fdb027-0110-4ff9-a39f-31946a22fc45
- description: Unterstuetzten `regenerate-token`-Endpunkt verwenden; Klartextwerte nur im Prozessspeicher halten; alten Token invalidieren und den neuen gegen Container-Config sowie Proxy pruefen.
- validation: Token durch den atomaren Rotation-Endpunkt ersetzt; Agent-Datensatz und Container-Config stimmen ueberein; aktueller Proxy-Zugang liefert HTTP 200. Der alte Klartext wurde danach bewusst nicht erneut aus dem Transcript beschafft.
- status: Complete
- next_action: Abgeschlossen; Agent-Datensatz und Container-Config stimmen ueberein, aktueller Proxy-Test HTTP 200. Der alte Token wurde durch den Rotation-Endpunkt atomar ersetzt; sein Klartext wurde bewusst nicht wieder aus dem Transcript beschafft.
- rollback: Erneut rotieren und frische Container-Config laden; der exponierte alte Token wird bewusst nicht wiederhergestellt.
- files: OneCLI PostgreSQL (Agent accessToken)
- executor: codex
- updated_at: 2026-07-21

### T3: Alle OPJ1-Sessions neu laden und live pruefen
- depends_on: [T2]
- location: NanoClaw-Laufzeit
- description: OPJ1 gruppenweit ohne Rebuild neu laden und ueber den lokalen CLI-Kanal einen frischen Container starten.
- validation: Alle vier MCP-Namensraeume sichtbar; sichere Healthchecks; OneCLI HTTP 200 mit Injektion; keine Standortabfrage.
- status: Complete
- next_action: Abgeschlossen; vier MCP-Namensraeume PASS, Gateway HTTP 200/injections_applied=1, Location nur Inventory/Handshake. Testcontainer danach beendet; keine geplante Testaufgabe angelegt.
- rollback: Nochmals Agent-Token rotieren und OPJ1 erneut laden.
- files: OPJ1-Runtime-Sessions
- executor: codex
- updated_at: 2026-07-21

### T4: Verifizieren und dokumentieren
- depends_on: [T3]
- location: NanoClaw und /opt/shared
- description: Tests, Diff, Rechte, Service/Journal, PROJECT_STATUS, Plan-Archiv und OpenBrain-Abschlussbericht abschliessen.
- validation: Host- und Runner-Checks, taskbezogener Secret-Scan, active/running, NRestarts unveraendert.
- status: Complete
- next_action: Abgeschlossen; Host 798/798, Runner 174 pass/2 skip/0 fail, Build/Typechecks/Format gruen, Service active/running mit NRestarts=0. Lint unveraenderter Altbestand 12 Fehler/166 Warnungen.
- rollback: Dokumentation revertieren; Laufzeit-Rollback gemaess T2/T3.
- files: /opt/shared/PROJECT_STATUS.md, .plan/archive/opj1-onecli-token-rotation-plan.md
- executor: codex
- updated_at: 2026-07-21
