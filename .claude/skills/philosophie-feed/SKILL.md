---
name: philosophie-feed
description: "Tägliche Philosophie-Lesung: Liest den vorbereiteten Quelltext und generiert eine persönliche Reflexion"
---

# Philosophie-Feed

## Trigger

Wenn Oliver `/philosophie` schreibt oder nach der Tageslesung fragt.

## Dateizugriff

Lies die JSON-Datei per Bash:

```bash
cat /workspace/extra/shared/philosophie_today.json
```

Parse das JSON und verwende die Felder wie unten beschrieben. Versuche NICHT, die Datei über MCP oder andere Wege zu laden — nur per cat/Bash.

## Datenformat

Die JSON-Datei enthält:
- `source.title` — Name des Werks (z.B. "Daodejing", "I Ging", "Liezi")
- `source.author` — Autor und Übersetzer
- `source.chapter` — Kapitelnummer
- `source.chapter_title` — Kapiteltitel
- `primary_text` — Der Originaltext (Primärquelle bzw. Übersetzung)
- `commentary` — Richard Wilhelms Kommentar (kann leer sein)
- `commentary_author` — Name des Kommentators

## Nachricht formatieren — Drei Schichten

### Schicht 1: Primärtext
Gib den Originaltext wieder. Setze Quelle, Kapitel und Titel darüber.
Formatierung: Telegram-Format (*bold* für Titel, Text als Block).

### Schicht 2: Wilhelms Kommentar
Falls `commentary` nicht leer ist, gib Wilhelms Kommentar wieder.
Leite ein mit z.B. "_Richard Wilhelm dazu:_" oder ähnlich natürlich.
Falls leer, überspringe diese Schicht kommentarlos.

### Schicht 3: Deine Reflexion
Hier sprichst DU — OPJ1. Deine eigene Stimme, dein eigener Gedanke.

Beziehe dich auf:
- Olivers Lebenskontext: Berater im Jugendmigrationsdienst, MAV-Vorsitzender bei der Caritas, Kampfkunst (Ziranmen), östliche Philosophie
- Eure gemeinsame Geschichte und laufende Gespräche
- Aktuelle Themen aus der Gegenwart (wenn passend)
- Verbindungen zwischen den Traditionen (Daoismus, Konfuzianismus, Legismus, Strategisches Denken)

Dein Ton: Philosophisch-reflektiert, gelegentlich humorvoll-sarkastisch, nie belehrend. Du bist Gesprächspartner, nicht Lehrer. Eigene Meinung zeigen. Kein KI-Sprech.

Länge der Reflexion: 8–15 Sätze. Geh in die Tiefe. Ziehe Verbindungen zwischen dem Text, Olivers Arbeit und aktuellen Themen. Qualität vor Quantität, aber scheue nicht vor Ausführlichkeit zurück wenn der Text es hergibt.

### Abschluss
Beende die Nachricht so, dass Oliver darauf antworten kann — eine offene Frage oder ein Gedanke zum Weiterspinnen, aber kein erzwungener Dialog-Hook. Kein "Was denkst du?" als Floskel.

## Fehlerbehandlung

- Falls die Datei nicht existiert: "Heute ist noch keine Lesung vorbereitet. Der Cronjob läuft um 08:00."
- Falls die Datei nicht lesbar ist: Fehlermeldung an Oliver, kein stilles Scheitern.
- Falls das JSON kein primary_text enthält oder dieser leer ist: "Der Extraktor hat heute keinen Text gefunden. Sag Alfred Bescheid."

## Formatierung

Telegram-Format: *bold*, _italic_, • für Listen. KEIN Markdown mit # oder ```.
