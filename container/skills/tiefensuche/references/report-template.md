# Berichtsstruktur (Phase 6)

Zwei Dateien. Der Bericht ist für den Leser, das Audit-Log für Nachvollziehbarkeit und Fehlersuche. Der Bericht verweist auf das Audit-Log, dupliziert es nicht.

## Konfidenz-Rubrik (verbindlich)

| Marke | Bedingung |
|---|---|
| **[hoch]** | ≥2 unabhängige (nicht-echoende) T1/T2-Quellen, kein substanzieller Widerspruch |
| **[mittel]** | 1 T1/T2-Quelle, oder mehrere konvergente T3-Quellen, keine Gegenbelege |
| **[niedrig]** | nur T3/T4-Quellen oder Einzelquelle |
| **[umstritten]** | substanzielle Quellen auf beiden Seiten — dann Pflicht-Eintrag in der Widerspruchssektion |

"Unabhängig" heißt: Echo-Prüfung bestanden (Phase 3 / Fetch-Worker-Rückgabe). Tier-Angaben, die eine [hoch]-Konfidenz tragen, müssen in Phase 5 verifiziert sein — vorläufige Phase-2-Schätzungen genügen nicht.

## Datei 1 — `bericht.md`

```markdown
# Tiefenrecherche: [Kernfrage]

**Modus:** guided / guided-full / auto
**Domäne:** [aus Phase 0] · **Streitigkeitsgrad:** [aus Phase 0]
**Backends:** [Liste] · **Tool-Calls:** [Zahl]/[Budget] · **Plan-Revisionen:** [0/1]
**Konfidenz Gesamtbild:** hoch / mittel / niedrig
**Audit-Log:** siehe audit.md

## Executive Summary
3–5 Sätze. Jeder Satz mit Konfidenz-Marke nach Rubrik: [hoch], [mittel], [niedrig], [umstritten].

## Findings nach Aspekt

### [Aspekt 1, z. B. "Historische Ursprünge"]

[Aussage in eigener Formulierung] [Konfidenz-Marke] [Stand: MM/JJJJ falls Verfallsrisiko]
> "Originalzitat ≤20 Wörter" — Quellenname, [URL]

[Nächste Aussage …]

### [Aspekt 2 …]

## Widersprüche und konkurrierende Positionen

| Aussage | Position A | Position B | Bewertung |
|---|---|---|---|
| … | Quelle X behauptet … | Quelle Y behauptet … | unentschieden / A überzeugender weil … |

Konfligierende Zahlen gehören hierher — mit beiden Werten, Einheiten und Stichtagen. Nie mitteln.

## Adversariale Befunde

Was sagen Quellen, die der Hauptthese widersprechen? Welche Einwände sind substanziell, welche schwach (methodische Bewertung, keine inhaltliche Parteinahme)?

## Lücken und offene Fragen

- Welche Pflichtquellen aus Phase 1 fehlen — Recherchefehler oder existiert das Material nicht?
- Wo war die Quellenlage zu dünn?
- **Aktualitäts-Check:** Aussagen, deren jüngster Beleg auffällig alt ist, obwohl die Domäne schnelllebig ist.
- Bei abgebrochenem Lauf (Budget / Revisions-Limit): was wurde *nicht* fertig recherchiert?
```

## Datei 2 — `audit.md`

Formatierung darf ein Haiku-Subagent übernehmen (reine Strukturierung vorliegender Daten).

```markdown
# Audit-Log: [Kernfrage]

## Recherche-Plan

[JSON-Plan aus Phase 1. Bei Revision: beide Pläne mit Revisionsgrund. Bei User-Anpassungen im Guided-Modus: Original + angepasste Fassung.]

## Recherche-Verlauf

Pro Subquery:
- **Abgesetzte Such-Strings** (pro Backend, exakt wie abgesetzt, mit Trefferanzahl)
- **Verworfene Treffer** mit Verwerfungsgrund (irrelevant / Echo von Quelle X / Marketing / off-topic)
- **Tier-Korrekturen** aus Phase 5 (von → nach, Begründung)
- **Adversarial-Suchen ohne Ergebnis** (Suchbegriffe + "0 brauchbare Treffer")
- **Re-Suchen** aus Phase 4 (Subquery, modifizierte Begriffe)
- **Subagent-Notizen** (Fallbacks auf inline, Modell-Anhebungen Haiku→Sonnet, gescheiterte Fetches)

## Entscheidungen des Auto-Modus

[Nur im Auto-Modus: Triage-Entscheidungen, Gründlichkeits-Trigger ausgelöst ja/nein, Cache-Hit-Behandlung aus Phase 0.]

## Vollständige Quellenliste

Alle URLs, gruppiert nach verifiziertem Tier, mit Publikationsdatum (falls bekannt) und Datum des Abrufs.
```

## Stilregeln für den Bericht

- Jede empirische Aussage trägt Provenienz (Zitat + URL) oder eine explizite Unverifiziert-Markierung.
- Jede Zahl: exakter Wert + Einheit + Bezugszeitraum + Quelle.
- Aussagen mit Verfallsrisiko (Rechtslage, Statistik, Produktclaims, Amtsinhaber): Stichtag im Format [Stand: Quelle MM/JJJJ].
- Keine Empfehlungen, keine inhaltliche Parteinahme bei Kontroversen.
- Lieber ein hässlicher Bericht mit lückenloser Quellenangabe als ein schöner ohne Nachvollziehbarkeit.
