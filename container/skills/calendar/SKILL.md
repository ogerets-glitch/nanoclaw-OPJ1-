---
name: calendar
description: "Kalender abfragen: Termine anzeigen, Verfügbarkeit prüfen, Termine suchen. Liest einen Google Calendar via iCal-URL (read-only)."
allowed-tools: Bash(node:*), Bash(calendar:*)
---

# Kalender-Skill

Zugriff auf Olivers Google-Kalender via iCal (read-only).

## Trigger

Nutze diesen Skill wenn es um Termine, Kalender, Verfügbarkeit oder Zeitplanung geht.
Typische Stichworte: Kalender, Termin, Termine, Woche, heute, morgen, frei, Zeit,
Verfügbarkeit, schedule, appointment, was steht an, was liegt an, wann bin ich frei.

## Hilfsskript

```bash
# Termine heute
node /home/node/.claude/skills/calendar/calendar.mjs --today

# Termine der nächsten N Tage
node /home/node/.claude/skills/calendar/calendar.mjs --days 7

# Termine suchen
node /home/node/.claude/skills/calendar/calendar.mjs --search "Teamsitzung"

# Kombination: suche in den nächsten 14 Tagen
node /home/node/.claude/skills/calendar/calendar.mjs --days 14 --search "Caritas"
```

## Parameter

| Parameter | Beschreibung |
|---|---|
| `--today` | Nur Termine von heute |
| `--days N` | Termine der nächsten N Tage (Standard: 7) |
| `--search "Text"` | Filtert nach Text in Titel, Beschreibung oder Ort |

## Ausgabeformat

Das Skript gibt pro Termin aus:
- Datum und Uhrzeit (oder "Ganztägig")
- Titel
- Ort (falls vorhanden)
- Beschreibung (falls vorhanden)

Ganztägige Termine und Zeitraum-Termine werden korrekt erkannt.

## Hinweise

- Der Kalender ist **read-only** — Termine können nur gelesen, nicht erstellt oder geändert werden.
- Die Datenquelle ist ein iCal-Feed, der bei jedem Aufruf aktuell abgerufen wird.
- Bei Fehlern (Netzwerk, fehlende Konfiguration) gibt das Skript eine klare Fehlermeldung aus.
- Die Kalender-URL ist ein Secret und wird nie in Ausgaben gezeigt.

## Typische Nutzung

- "Was steht heute an?" → `--today`
- "Was hab ich diese Woche?" → `--days 7`
- "Wann ist die nächste Teamsitzung?" → `--search "Teamsitzung"`
- "Bin ich Freitag frei?" → `--days N` (bis Freitag), dann Ergebnis interpretieren
- "Zeig mir alle Termine nächste Woche" → `--days 14` und relevante Tage filtern

## Formatierung

Telegram-Format: *bold*, _italic_, • für Listen. KEIN Markdown mit # oder ```.
