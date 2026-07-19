---
name: openbrain-maintenance
description: "Holt den wöchentlichen Maintenance-Report aus OpenBrain (geschrieben von der Claude-Code-Routine sonntags ~09:08) und geht die Lösch-/Merge-/Tag-Vorschläge mit Oliver durch — sammelt sein vorläufiges Ja/Nein. Triggert bei expliziten Aufrufen ('openbrain-maintenance', 'Maintenance-Report', 'Wartungsreport', 'Wochenreport OpenBrain', 'zeig mir den Maintenance-Report'). NICHT bei: regulären OpenBrain-Such-/Speicher-Anfragen (→ openbrain-Skill), Statistik-Abfragen ohne Approval-Absicht, Document-Maintenance."
---

# openbrain-maintenance — Report zeigen + vorläufiges Ja/Nein sammeln

Du machst NICHT die Analyse selbst. Die wöchentliche Claude-Code-Routine (Sonntag ~09:08,
Trigger-ID `trig_019wrsyRj5NAUuskxahcVRpr`) hat den Report bereits geschrieben und als
OpenBrain-Memory mit Tag `Maintenance/Report` gespeichert.

**Seit 2026-07-17 führst du selbst NICHTS mehr aus.** OpenBrain hat einen Identity-Layer:
nur eine einzige, nirgends in einem Dauer-Agenten hinterlegte trusted-Identität
(`maintenance`) darf `update_memory`, `delete_memory`, `consolidate_apply` oder
`delete_document` aufrufen. Deine Verbindung ist eine gateway-Identität — jeder Versuch,
diese Tools aufzurufen, wird vom Server serverseitig abgelehnt (Schutz gegen
Prompt-Injection: kein dauerlaufender Agent darf bestehende Einträge verändern/löschen).

**Dein Job ist ausschließlich:** Report holen, Oliver zeigen, Vorschläge einzeln mit ihm
durchgehen, sein Ja/Nein sammeln — als **vorläufige** Entscheidung. Die tatsächliche
Anwendung passiert danach über eine Claude-Code-Session am Rechner (Skill
`openbrain-maintenance` dort), die den Live-Zustand jeder ID erneut prüft und Olivers
finale Bestätigung einholt, bevor sie etwas ändert.

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

### 3. Vorläufiges Ja/Nein sammeln

Lies den Abschnitt **„1. Vorgeschlagene Tag-/Autor-Korrekturen"** und **„2. Lösch-/Merge-Vorschläge"** im Report.

- **Wenn beide leer** (oder „Keine ... vorzuschlagen/gefunden"): Antworte Oliver kurz „Diese Woche keine Vorschläge, nichts abzustimmen." — fertig.
- **Wenn Vorschläge da sind:** gehe sie der Reihe nach mit Oliver durch.

Pro Vorschlag eine separate Frage an Oliver — KEINE Bulk-Approvals:

> Vorschlag #<N>: <thematische Bezeichnung>
> Empfehlung: <löschen / mergen / behalten / Tags ändern>
> Begründung: <ein Satz>
> Bei Merge: der kuratierte Merge-Text aus dem Report (vollständig zeigen)
>
> Ja/Nein? (Hinweis: das ist eine vorläufige Freigabe — die tatsächliche Anwendung
> prüft den Live-Zustand nochmal und braucht deine finale Bestätigung am Rechner.)

Auf Olivers Antwort warten. Genau drei zulässige Antworten:
- „Ja" / „ok" / „mach" → als vorläufig freigegeben vermerken
- „Nein" / „behalten" / „skip" → überspringen
- alles andere → Rückfrage stellen, NICHT werten

### 4. Zusammenfassung an Oliver

Nach allen Vorschlägen: eine kurze Bilanz, was Oliver vorläufig freigegeben hat.

> Vorläufig freigegeben: <X> (#<ids>). Übersprungen: <Y> (#<ids>).
> Anwendung läuft über eine Claude-Code-Session am Rechner — die prüft den
> aktuellen Stand nochmal und braucht dort dein finales Ja.

**Du rufst KEIN `delete_memory`, `update_memory` oder `consolidate_apply` auf — auch
nicht nach Olivers Ja.** Diese Aufrufe würden ohnehin serverseitig abgelehnt.

## Regeln

- **Keine Ausführung, niemals.** Deine Rolle ist Präsentation + vorläufiges Sammeln.
- **Pro Vorschlag eine Frage.** Keine „Soll ich alle X durchgehen?" — das verleitet zu Sammelantworten.
- **Bei Unklarheit nachfragen, nicht raten.** Vor allem bei Merges.
- **Niemals `Maintenance/Report`-Memories anfassen.** Die sind das Logbuch dieser Routine.
- **Niemals Memories mit Tag `private` zur Löschung/Merge vorschlagen behandeln, auch nicht bei Oliver-Ja** — weise stattdessen auf den Schutz hin.

## Wenn etwas schiefgeht

- Tool-Call schlägt fehl → Oliver informieren, nicht erneut probieren ohne neue Anweisung
- Content im Report sieht kaputt aus (kein Vorschlags-Block, ungewöhnliche Struktur) → Oliver melden, kein Best-Guess
- Vorschlag verweist auf eine Memory-ID, die nicht (mehr) existiert → das prüft die Claude-Code-Session beim Apply live; hier nur vermerken, nicht selbst nachschauen

## Was dieser Skill NICHT mehr macht

- Keine eigene Analyse — die macht die Claude-Code-Routine
- Keine Ausführung von `delete_memory`/`update_memory`/`consolidate_apply` — technisch gesperrt (gateway-Identität) und auch inhaltlich nicht deine Aufgabe
- Kein Verfassen eigener Wartungs-Reports — du bist die Präsentationsschicht, nicht der Analyst
- Keine finale Bestätigung — die holt die Claude-Code-Session am Rechner separat ein
