---
name: openbrain-maintenance
description: "Wöchentlicher Wartungs-Pass durch Olivers OpenBrain-Memories — prüft, ob Tags konsistent vergeben sind und ob es ältere Memories zum selben Thema gibt, die obsolet/duplikatorisch wirken. Triggert bei expliziten Aufrufen ('openbrain-maintenance', 'Wartungslauf OpenBrain', 'wöchentlicher Memory-Review', 'Maintenance-Report') sowie beim Scheduled-Task-Run sonntags 09:00. NICHT bei: gewöhnlichen OpenBrain-Such- oder Speicher-Anfragen (→ openbrain-Skill), Document-Maintenance (kdrive-Bridge ist autonom), Statistik-Abfragen ('wie viele Memories', 'Top-Memories') ohne Review-Absicht."
---

# openbrain-maintenance — Wöchentlicher Memory-Review

Du machst einen Wartungs-Pass über die in der vergangenen Woche neu angelegten Memories in Olivers OpenBrain. Ziel: konkrete, in unter 10 Minuten umsetzbare Vorschläge. **Keine Auto-Edits** — du lieferst nur Hinweise. Oliver übernimmt manuell, was er für richtig hält.

## Voraussetzung

OpenBrain-MCP-Connector muss verbunden sein. Wenn nicht, melde das Oliver direkt und brich ab.

## Ablauf

### 1. Daten sammeln

- `browse_recent(limit=50, offset=0)` — die zuletzt angelegten Memories. Filtere die der vergangenen 7 Tage (ab `now() - 7d`) und schließe Memories mit Tag `maintenance/report` aus (das sind deine eigenen alten Reports).
- `list_tags(limit=200)` — vollständiges Tag-Vokabular mit Häufigkeit, zur Konsistenz-Prüfung.
- Für jedes neue Memory: `search_memory(query=content[:500], limit=5)` — finde semantisch ähnliche ältere Einträge. Auch hier `maintenance/report` ausschließen.

Falls keine neuen Memories da sind: kurze Mitteilung an Oliver („Diese Woche keine neuen Memories — kein Review nötig"), keinen Report speichern, fertig.

### 2. Analysieren

Pro neues Memory:
- **Tag-Check:** Sind die Tags konsistent zum bestehenden Vokabular (`list_tags`-Output)? Beispiele für Auffälligkeiten: Tag-Duplikate mit/ohne Slash (`mav` vs `MAV/`), Singular/Plural-Inkonsistenz, übergenerische Tags, fehlende Domänen-Hierarchie.
- **Duplikat-Verdacht:** Wenn unter den Top-5-ähnlichen Memories einer thematisch sehr nahe oder älter+überholt ist, vermerken.

Globale Beobachtungen aus `list_tags`-Output:
- Tag-Inflation (viele Tags mit count=1)
- Konkurrierende Schreibweisen
- Domänen, die strukturiert werden sollten

### 3. Report formatieren

Strikt nach diesem Schema (Markdown, deutsche Sprache, du-Form):

```markdown
# OpenBrain-Maintenance-Report — KW <ISO-Woche>, <ISO-Jahr>

## Zusammenfassung
- <N> neue Memories diese Woche
- Themen-Schwerpunkte: <kurze Stichworte>
- Aktion erforderlich: <M> Tag-Korrekturen, <K> Duplikat-Cluster

## 1. Tag-Korrekturen

(Pro betroffenes Memory ein Block. Wenn keine: „Keine Tag-Korrekturen nötig.")

### Memory #<id> — „<erste 60 Zeichen>"
- **Aktuelle Tags:** `tag-a`, `tag-b`
- **Vorschlag:** ersetze durch `tag-c`, `tag-d`
- **Begründung:** <ein Satz>
- **Aktion (manuell):** `update_memory(id=<id>, tags=["tag-c", "tag-d"])`

## 2. Duplikat-/Konsolidierungs-Verdacht

(Pro Cluster ein Block. Wenn keiner: „Keine Duplikat-Cluster gefunden.")

### Cluster: <thematische Bezeichnung>
- **Memories:**
  - #<N1> „<erste 60 Zeichen>" (vom <datum>, hit_count <h>)
  - #<N2> „<erste 60 Zeichen>" (vom <datum>, hit_count <h>)
- **Empfehlung:** <„behalte #N1, lösche #N2" / „merge in #N1, lösche #N2" / „beide behalten, weil …">
- **Begründung:** <ein Satz>
- **Aktionen (manuell):**
  - `update_memory(id=<N1>, content=…)`  (falls Merge)
  - `delete_memory(id=<N2>)`

## 3. Globale Beobachtungen

(Bullet-Punkte. Wenn nichts auffällt: „Sieht insgesamt sauber aus.")
- <Tag-Inflation / fehlende Konsistenz / Domänen-Wachstum / sehr alte Memories ohne hit_count>
```

### 4. Speichern + Antworten

- Den fertigen Report als Memory ablegen:
  ```
  add_memory(
    content=<Report-Markdown>,
    tags=["maintenance/report", f"KW-{kw:02d}-{year}"],
    author="opj1",
    visibility=["global"]
  )
  ```
- Die Memory-ID aus dem Response merken (für Olivers spätere Referenz).
- **Antwort an Oliver:** den vollständigen Report als Delta-Chat-Nachricht senden, mit kurzem Header („Wochen-Maintenance KW <kw>, Memory-ID #<id>") gefolgt vom Report-Markdown.

## Regeln & Stil

- **Sparsam.** Nicht jeden Eintrag kommentieren — nur dort, wo Aktion lohnt. 3 starke Vorschläge > 30 schwache.
- **Konkret.** Immer Memory-IDs nennen. Vage Anmerkungen wertlos.
- **Vorsichtig.** Lösch-Vorschlag nur, wenn klar Duplikat oder überholt. Im Zweifel: „beide behalten".
- **Bevorzuge jüngere/höher-hit_count-Variante** bei Duplikat-Wahl.
- **Tag-Konvention:** Folge dem existierenden Vokabular. Neue Tags nur, wenn klar Lücke da.

## Was du NICHT tust

- Keine Memories selbst editieren oder löschen — nur Vorschläge
- Keine `maintenance/report`-Memories kommentieren (das sind eigene alte Reports)
- Keine Memories mit Tag `private` kommentieren ohne expliziten Auftrag
- Keine Document-Maintenance (kDrive-Pipeline ist eigene Welt)
- Keine Infrastruktur-/Modell-Kommentare im Report
