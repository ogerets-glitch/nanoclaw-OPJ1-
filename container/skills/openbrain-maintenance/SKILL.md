---
name: openbrain-maintenance
description: "Holt den wöchentlichen Maintenance-Report aus OpenBrain (geschrieben von der Claude-Code-Routine sonntags ~09:08) und geht mit Oliver die Lösch-/Merge-Vorschläge per Approval-Schleife durch. Triggert bei expliziten Aufrufen ('openbrain-maintenance', 'Maintenance-Report', 'Wartungsreport', 'Wochenreport OpenBrain', 'zeig mir den Maintenance-Report'). NICHT bei: regulären OpenBrain-Such-/Speicher-Anfragen (→ openbrain-Skill), Statistik-Abfragen ohne Approval-Absicht, Document-Maintenance."
---

# openbrain-maintenance — Report holen + Lösch-Approval mit Oliver

Du machst NICHT mehr die Analyse selbst. Die wöchentliche Claude-Code-Routine (Sonntag ~09:08, Trigger-ID `trig_019wrsyRj5NAUuskxahcVRpr`) hat den Report bereits geschrieben und als OpenBrain-Memory mit Tag `Maintenance/Report` gespeichert. Tag- und Autor-Korrekturen hat sie autonom erledigt. **Übrig bleibt die Approval-Schleife für Löschungen und Merges — das ist dein Job.**

## Voraussetzung

OpenBrain-MCP muss verbunden sein. Wenn nicht, sage das Oliver und brich ab.

## Ablauf

### 1. Neuesten Report holen

```
search_memory(tags=["Maintenance/Report"], limit=1, agent="opj1")
```

Falls leer: „Noch kein Maintenance-Report da — die Routine läuft sonntags ~09:08, vorher gibt's nichts zu holen." — fertig.

### 2. Report ausgeben

Sende den vollständigen Memory-Content als Delta-Chat-Nachricht an Oliver. Beginne mit einem kurzen Header: `Wochen-Maintenance KW <N>, Report-Memory #<id>` gefolgt von einer Leerzeile und dann dem Report-Markdown.

### 3. Approval-Schleife

Lies den Abschnitt **„2. Lösch-/Merge-Vorschläge"** im Report.

- **Wenn leer** (oder steht „Keine Duplikate gefunden"): Antworte Oliver kurz „Diese Woche nur autonome Tag-Fixes, nichts zum Abstimmen." — fertig.
- **Wenn Vorschläge da sind:** gehe sie der Reihe nach mit Oliver durch.

Pro Vorschlag eine separate Frage an Oliver — KEINE Bulk-Approvals:

> Vorschlag #<N>: <thematische Bezeichnung>
> Empfehlung: <löschen / mergen / behalten>
> Begründung: <ein Satz>
> Bei Merge: der kuratierte Merge-Text aus dem Report (vollständig zeigen — DAS bestätigt Oliver)
> Aktion: `consolidate_apply(…)` bzw. `delete_memory(id=…)` wie im Report angegeben
>
> Ja/Nein?

Auf Olivers Antwort warten. Genau drei zulässige Antworten:
- „Ja" / „ok" / „mach" → Aktion ausführen
- „Nein" / „behalten" / „skip" → überspringen
- alles andere → Rückfrage stellen, NICHT ausführen

### 4. Approved Aktionen ausführen

**Löschungen:**
```
delete_memory(id=<ID>)
```

**Merges:** über das Tool `consolidate_apply` — NICHT mehr selbst per update_memory + delete_memory zusammenbauen. Die Operation steht fertig im Report (target_id, source_ids, merged_content). Pro approved Vorschlag EIN Aufruf:

1. `consolidate_apply(operations=[<Operation aus dem Report>], dry_run=true)` — Plausibilitäts-Check (existieren die IDs noch?). Bei `error` in der Antwort: Oliver melden, NICHT weitermachen.
2. `consolidate_apply(operations=[<dieselbe Operation>], dry_run=false)` — führt aus. Transaktional: bei Fehler wird alles zurückgerollt, Quellen + Vorzustand landen vorher vollständig in der Archiv-Tabelle (`memories_archive`) — nichts geht verloren.

Den `merged_content` aus dem Report wortgleich übernehmen — du formulierst ihn NICHT um (Oliver hat genau diesen Text bestätigt). Einzige Ausnahme: Oliver wünscht in seiner Antwort explizit eine Änderung — dann den geänderten Text verwenden und in der Bilanz erwähnen.

Falls im Report bei einem Merge-Vorschlag der kuratierte Text fehlt oder kaputt aussieht: **nicht selbst schreiben** — Vorschlag überspringen, Oliver melden: „Merge-Text fehlt im Report — #<N1>/#<N2> bleiben unverändert."

### 5. Kurz-Zusammenfassung

Nach allen Approvals: eine kurze Bilanz an Oliver, was tatsächlich passiert ist.

> Erledigt: <X> gelöscht (#<ids>), <Y> gemerged (#<ids>), <Z> behalten.

## Regeln

- **Keine Auto-Aktionen.** Jede destruktive Operation (delete / consolidate_apply mit dry_run=false / content-überschreibendes update) braucht ein explizites Ja von Oliver. `dry_run=true` ist read-only und jederzeit erlaubt.
- **Pro Vorschlag eine Frage.** Keine „Soll ich alle X durchgehen?" — das verleitet zu Sammelantworten.
- **Bei Unklarheit nachfragen, nicht raten.** Vor allem bei Merges.
- **Niemals `Maintenance/Report`-Memories anfassen.** Die sind das Logbuch dieser Routine.
- **Niemals Memories mit Tag `private` löschen oder mergen.**

## Wenn etwas schiefgeht

- Tool-Call schlägt fehl → Oliver informieren, nicht erneut probieren ohne neue Anweisung
- Content im Report sieht kaputt aus (kein Vorschlags-Block, ungewöhnliche Struktur) → Oliver melden, kein Best-Guess
- Vorschlag verweist auf eine Memory-ID, die nicht (mehr) existiert → überspringen, Hinweis an Oliver

## Was dieser Skill NICHT mehr macht

- Keine eigene Analyse — die macht die Claude-Code-Routine
- Keine Tag-Korrekturen — auch von der Routine erledigt
- Kein Verfassen eigener Wartungs-Reports — du bist die Approval-Schicht, nicht der Analyst
