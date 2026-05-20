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
> Aktion: `<delete_memory(id=…)>` (bzw. Merge-Syntax)
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

**Merges:** zwei Schritte
1. Den gemergten Content selbst zusammensetzen (vereine die zwei alten Inhalte sinnvoll, ohne Doppelungen, Tag-Union, Author behalten)
2. `update_memory(id=<keep_id>, content=<gemerged>, tags=[<union>])`
3. `delete_memory(id=<drop_id>)`

Falls dir der Merge-Inhalt unklar ist (z.B. widersprüchliche Memories oder du bist dir nicht sicher, was zusammengehört): **nicht raten** — sag Oliver: „Merge unklar — wenn du das händisch lieber selbst schreibst, behalten wir #<N1> wie es ist und löschen #<N2> nicht." Frag erneut.

### 5. Kurz-Zusammenfassung

Nach allen Approvals: eine kurze Bilanz an Oliver, was tatsächlich passiert ist.

> Erledigt: <X> gelöscht (#<ids>), <Y> gemerged (#<ids>), <Z> behalten.

## Regeln

- **Keine Auto-Aktionen.** Jede destruktive Operation (delete / content-überschreibendes update) braucht ein explizites Ja von Oliver.
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
