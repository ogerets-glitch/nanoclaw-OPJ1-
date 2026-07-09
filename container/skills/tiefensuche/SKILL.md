---
name: tiefensuche
description: >-
  Strukturierte Tiefenrecherche mit Quellenvielfalt, Adversarial-Pass, expliziter
  Widerspruchsbehandlung und Lückenausweis. Nutze diesen Skill, wenn der User eine Frage
  stellt, die echte Recherche statt schneller Antwort braucht — also bei Begriffen wie
  "recherchiere", "finde heraus", "was wird zu X gesagt", "stimmt es dass…", "Hintergrund
  zu", oder bei Fragen zu kontroversen, nischigen oder schwer dokumentierten Themen.
  Liefert zwei Markdown-Dateien — Bericht mit Provenienz pro Aussage plus separates
  Audit-Log. Drei Modi — --guided (zwei Pflicht-Pausen für Plan-Review und Triage),
  --guided-full (zusätzlich Gliederungs-Checkpoint vor der Synthese), --auto
  (vollautomatisch, für Batch-Läufe oder Vergleichbarkeit mit autonomen
  Deep-Research-Systemen). NICHT verwenden bei Faktenfragen mit klarer eindeutiger
  Antwort, reinem Brainstorming ohne Recherche-Bedarf, Schreibaufgaben ohne Quellenarbeit.
---

# Tiefensuche v5

Strukturierte Recherche in sechs Phasen, orchestriert vom Hauptmodell mit Subagent-Delegation für mechanische und volltextlastige Arbeit. Designt für Themen, bei denen schnelle Antworten täuschen — kontroverse Geschichte, Nischen-Wissen, Bereiche mit viel Marketing-Schaum, Fragen wo "was nicht gesagt wird" so wichtig ist wie "was gesagt wird".

## Referenzdateien (bei Bedarf lesen, nicht vorab)

| Datei | Wann lesen |
|---|---|
| `references/subagents.md` | Vor dem ersten Subagent-Spawn (Phase 2). Definiert Modell-Tiering, Worker-Prompts, Rückgabeformate für die Claude-SDK-Umgebung. |
| `references/backends.md` | Zu Beginn von Phase 2. SearxNG-Konventionen, MCP-Routing-Tabelle, Engine-Profile, jq-Filter. |
| `references/plan-checks.md` | In Phase 1, direkt vor der Plan-Selbstprüfung. Die 6 Prüfkriterien mit Begründung. |
| `references/report-template.md` | Zu Beginn von Phase 6. Berichtsstruktur, Audit-Log-Struktur, Konfidenz-Rubrik. |

Ohne Subagent-Fähigkeit (kein Task-Tool / keine Agent-Spawns verfügbar): alle Phasen inline im Hauptmodell ausführen; `subagents.md` entfällt, der Rest gilt unverändert. Die Extract-then-Discard-Regel (siehe Phase 5) gilt dann erst recht.

## Aufrufmodi

Standard: `--guided` (User-Interaktion in Phase 1 und Phase 4). `--guided-full` ergänzt einen dritten Checkpoint: eine ~10-Zeilen-Gliederung der geplanten Findings vor Phase 6. Erkennt der Skill, dass der User einen autonomen Lauf will ("mach das alleine durch", "ohne Rückfrage", explizites `--auto`), wechselt er in den Auto-Modus, überspringt alle Pausen und dokumentiert alle Entscheidungen im Audit-Log.

## Tool-Call-Budget und Failsafes

- **Auto-Modus:** max. 80 Tool-Calls gesamt (Searches, Fetches, Memory-Lookups, Subagent-Spawns zählen je 1).
- **Guided-Modus:** max. 120, weil der User per Triage nachsteuert statt blind zu iterieren.

Bei 80 % Budget: Hinweis erzeugen, Phase 5 priorisieren. Bei 100 %: sofort Phase 6 forcieren — mit vorhandenen Daten, Markierung "Budget erschöpft, Synthese auf unvollständiger Basis" und offenen Subqueries als ausgewiesene Lücke.

**Gründlichkeits-Trigger (ersetzt die frühere budgetbasierte Erschöpfungsschwelle).** Nach Phase 5, vor Phase 6, prüfe inhaltlich: (a) Ist mehr als eine `erwartete_pflichtquelle` aus Phase 1 unbelegt geblieben? (b) Hat eine Subquery mit Priorität `hoch` weniger als 2 verifizierte Quellen? Wenn ja und Budget vorhanden: genau eine gezielte Zusatz-Suchwelle für die betroffenen Punkte, im Audit-Log markiert. Diese Heuristik gilt einmal pro Lauf; danach verbliebene Lücken werden berichtet, nicht weiterverfolgt.

**Kontextregel:** Volltexte werden nie im Orchestrator-Kontext gehalten (siehe Phase 5, Extract-then-Discard). Damit entfällt ein separates Kontext-Failsafe.

Diese Limits sind Failsafes, keine Zielwerte. Eine gute Recherche liegt typischerweise bei 25–50 Calls. Mehr ist meistens Symptom eines schlechten Plans, nicht einer schwierigen Frage.

## Phase 0 — Cache & Scope (Hauptmodell)

Bevor irgendein externer Tool-Call passiert:

1. Falls ein persistentes Memory-System verfügbar ist (z. B. OpenBrain, knowledge-base, memory-tool): mit Kernfrage und 2–3 Synonymen suchen. Bei substanziellen Treffern: Kurzfassung präsentieren und fragen "Reicht das, oder trotzdem extern recherchieren?". Im Auto-Modus: Cache-Hit im Audit-Log dokumentieren und trotzdem extern recherchieren, falls die Frage nicht vollständig beantwortet ist.

2. Frage entlang dreier Achsen klassifizieren:
   - **Domäne** (Recht / Statistik / Tagesaktuelles / Wissenschaft / Technisches / Kulturelles / Mixed) → entscheidet Quellengewichtung und Backend-Routing.
   - **Streitigkeitsgrad** (etabliert / kontrovers / aktiv umkämpft) → skaliert das Adversarial-Budget in Phase 3.
   - **Dokumentationsdichte** (gut dokumentiert / fragmentiert / überwiegend mündlich oder vertraulich) → entscheidet, ob "Lücken sind erwartbar" in den Bericht gehört.

3. Sprachvarianten festlegen:
   - **Originalsprache der Quellen:** Bei Themen mit nicht-deutschen/englischen Primärquellen Suchen in der Originalsprache einplanen, mindestens als transkribierte Eigennamen.
   - **Sprache des User-Praxiskontexts:** Wenn aus Memory hervorgeht, dass der User in einer bestimmten Sprache praktiziert oder arbeitet, mindestens eine Subquery in dieser lokalen Sprache einplanen. Lokale Fachpresse, Vereinszeitschriften, Kammer- und Verbandsveröffentlichungen enthalten oft Information, die im internationalen Web nicht erscheint.

## Phase 1 — Plan (Hauptmodell)

Recherche-Plan als strukturiertes JSON. Der Plan ist die wichtigste Phase — wenn er gut ist, funktioniert alles andere.

```json
{
  "kernfrage": "...",
  "domaene": "...",
  "streitigkeitsgrad": "...",
  "subqueries": [
    {
      "id": "Q1",
      "aspekt": "Konkreter Teilaspekt der Kernfrage",
      "suchbegriffe_de": ["..."],
      "suchbegriffe_en": ["..."],
      "suchbegriffe_original": ["..."],
      "adversarial_variante": "Wie würde jemand suchen, der das Gegenteil belegen will?",
      "erwartete_quellgattung": "Primärtext / Forschung / Forum / Marketing-Filter nötig",
      "prioritaet": "hoch/mittel/niedrig"
    }
  ],
  "erwartete_pflichtquellen": ["Quellen, die ein guter Lauf finden MUSS"],
  "lueckenerwartung": "Wo erwarte ich, dass wenig Material existiert?"
}
```

Regeln:
- 4–8 Subqueries. Jede muss einen *anderen* Aspekt angehen, nicht denselben mit anderen Worten.
- **Pflicht-Subquery lokale Sprache:** Wenn Phase 0 eine User-Praxissprache identifiziert hat, MUSS eine Subquery mit eigenem Slot dezidiert auf Quellen dieser Sprache zielen (Fachpresse, akademische Studien des Sprachraums, Verbands-/Kammer-Veröffentlichungen). Nicht akzeptabel: lokale Begriffe nur als Beiwerk in einer globalen Subquery.
- Beispiele und Domänen-Nennungen im Plan divers halten; eine Domänen-Häufung muss in der Kernfrage begründet sein, nicht in vorheriger Konversation oder Skill-Historie.

**Plan-Selbstprüfung:** Lies jetzt `references/plan-checks.md` und prüfe den Plan gegen die 6 Kriterien. Bei Nichterfüllung: einmal revidieren, bevor Phase 2 startet. Scheitert auch die Revision an einem Kriterium: Schwäche im Audit-Log dokumentieren und fortfahren.

**Guided:** Plan präsentieren: "Plan sieht so aus. Was streichen, was ergänzen, welche Subquery anders fokussieren?" Auf Antwort warten, anpassen. **Auto:** Plan wandert unverändert ins Audit-Log.

## Phase 2 — Parallel Broad Search (Haiku-Subagents)

Lies `references/backends.md` (Routing, Engine-Profile, Aufruf-Konventionen) und `references/subagents.md` (Spawn-Konventionen), falls noch nicht geschehen.

Pro Subquery einen **Haiku-Subagenten** spawnen — alle Subqueries parallel in einem Turn. Jeder Worker erhält: seine Subquery (Suchbegriffe alle Sprachen + Adversarial-Variante), das Backend-Routing für die Domäne, und das Rückgabeformat. Der Worker setzt die Suchen ab, parst die Ergebnisse und liefert eine strukturierte Treffertabelle zurück:

| Subquery | URL | Titel | Datum | Backend | Tier-Schätzung | Snippet (max. 30 Wörter) |
|---|---|---|---|---|---|---|

Dazu pro Backend: tatsächlich abgesetzte Such-Strings (inkl. Operatoren/Anführungszeichen) und Trefferanzahl — fließt ins Audit-Log.

Tier-Skala: **T1** Primärquelle (Originaldokument, Gesetzestext, peer-reviewed Studie) · **T2** Sekundärquelle (Fachjournalismus, etablierte Researcher, offizielle Stellen) · **T3** Tertiär (Mainstream-Medien, Wikipedia, Erklärartikel) · **T4** Community/Forum (Perspektiven ja, Fakten vorsichtig) · **T?** unklar → Phase 5.

**Wichtig:** Tier-Schätzungen aus Phase 2 sind *vorläufig* (Haiku-Klassifikation). Jede T1/T2-Einstufung, die in den Bericht einfließt, muss in Phase 5 verifiziert sein. Snippets müssen aus dem Quelltext stammen; bei Unsicherheit T? markieren statt raten.

## Phase 3 — Convergence + Adversarial (Hauptmodell, Ausführung teils Haiku)

**Schritt 1 — Konvergenz-Clustering.** Treffer identifizieren, die im Kern dieselbe Aussage machen. Drei unabhängige Quellen — idealerweise verschiedene Sprachräume, Schulen, Medien — sind ein starkes Konfidenz-Signal. Cluster in der Treffertabelle markieren. **Echo-Detection:** Quellen, die voneinander oder von derselben Hauptquelle abschreiben, sind keine Konvergenz. Indizien: identische Formulierungen, identische Fehler/Zahlen, explizite Zitation, gleiche Erstquelle. Bei Unsicherheit: niedrigere Konfidenz.

**Schritt 2 — Adversarial-Pass.** Zwei Modi, beide durchführen, wenn plausibel. Die Suchbegriffe formuliert das Hauptmodell (das ist die anspruchsvolle Hälfte), die Ausführung übernehmen Haiku-Worker wie in Phase 2:
- **(a) Gegenpositions-Suche:** Wenn Phase 2 "X ist Y" stützt, aktiv nach "X ist nicht Y" suchen — Kritik, Skepsis, Widerlegung.
- **(b) Vollständigkeits-Suche:** Nach Quellen suchen, die zeigen, dass die Hauptthese *unvollständig* ist — parallele unabhängige Linien gleichen Namens, konkurrierende Schulen, abweichende Tradierungswege. Suchstrings: "alternative [Name]", "second [Name]", "[Name] disambiguation", "[Name] separate lineage", "andere [Name]-Linie".

Adversarial-Treffer in eine separate Tabellensektion. Auch ergebnislose Adversarial-Suchen ins Audit-Log — "gegengesucht, nichts gefunden" ist substanziell.

**Schritt 3 — Lücken-Inventur.** `erwartete_pflichtquellen` gegen tatsächliche Funde abgleichen. Fehlendes explizit listen.

**Schritt 3a — Lücken-Schließer.** Entspricht eine fehlende Pflichtquelle einer Quellgattung, die ein Spezial-Backend abdeckt: genau *ein* gezielter Aufruf mit dem passenden Engine-Profil aus `backends.md` (kein erneuter Broad Search). Liefert auch der gezielte Aufruf nichts: substanzieller Befund für den Bericht ("Material existiert wahrscheinlich nicht").

## Phase 4 — Triage (Guided: User / Auto: Sonnet-Logik)

**Guided:** Gekürzte Treffertabelle präsentieren (Top 15–20 + alle Adversarial + alle T1). Frage: "Welche verwerfen, welche vertieft fetchen, welche Subquery braucht einen zweiten Versuch?" Bei gewünschten Re-Suchen: zurück zu Phase 2 für die markierten Subqueries mit angepassten Begriffen.

**Auto:** Regel: Top-3 pro Subquery + alle T1 + alle Adversarial + alle T?. Subquery mit <2 brauchbaren Treffern: genau einmal automatisch nachsuchen mit modifizierten Begriffen. Pro verworfenem Treffer den Verwerfungsgrund kurz notieren ("Marketing-Schaum" / "Echo von Quelle X" / "off-topic") → Audit-Log.

**Strukturelles Plan-Versagen:** Haben nach der Triage mehr als die Hälfte der Subqueries keine brauchbaren Treffer (weder T1–T3 noch Adversarial), war wahrscheinlich der Plan strukturell falsch. Dann **einmal** zurück zu Phase 1 (andere Aspekte, Sprachvarianten, Quellgattungen; Guided mit User-Bestätigung, Auto mit Begründung im Audit-Log), danach erneut Phase 2→3→4. Reißt auch der revidierte Plan die 50-%-Schwelle: nicht ein drittes Mal — direkt zu Phase 5/6 mit expliziter Notiz "Plan-Revision auch im 2. Anlauf erfolglos; wahrscheinlich extrem dünne Quellenlage". Mehrfache Plan-Revisionen sind ein Symptom dafür, dass die Frage selbst neu formuliert werden muss — Aufgabe des Users, nicht des Skills.

## Phase 5 — Deep Fetch (Sonnet-Subagent-Fanout, Extract-then-Discard)

**Kernregel: Volltexte betreten nie den Orchestrator-Kontext.** Pro in Phase 4 markierter Quelle einen **Sonnet-Subagenten** spawnen (parallel, gebündelt nach `subagents.md`). Jeder Worker fetcht *seine* Quelle und liefert ausschließlich zurück:

1. **Provenienz-Einträge:** pro relevanter Aussage ein Originalzitat (max. 20 Wörter, kein Copyright-Verstoß), URL, ggf. Seitenzahl/Sektion.
2. **Subquery-relevante Zusammenfassung:** max. 150 Wörter.
3. **Tier-Verifikation:** Bestätigung oder Korrektur der Phase-2-Schätzung, mit Begründung bei Korrektur ("T2 → T3: Quelle ist Aggregator") → Audit-Log.
4. **Zahlen-Extrakte:** jede relevante Zahl mit exaktem Wert, Einheit, Bezugszeitraum/Stichtag.
5. **Relevanz-Urteil:** verwendbar / nur Verifikation / Ausschluss (mit Grund).

Nicht jede gefetchte Quelle landet im Bericht; Ausschlüsse werden kurz dokumentiert. Ohne Subagent-Fähigkeit: Fetch inline, aber sofort nach der Extraktion den Volltext verwerfen und nur die fünf Rückgabe-Elemente behalten.

Danach: **Gründlichkeits-Trigger** prüfen (siehe Failsafes oben). **--guided-full:** jetzt die ~10-Zeilen-Gliederung der geplanten Findings präsentieren (Aspekte, Hauptaussagen, Widersprüche) und Feedback abwarten, bevor der Bericht geschrieben wird.

## Phase 6 — Synthese (Hauptmodell)

Lies `references/report-template.md` und erzeuge **zwei Dateien**:

- **`bericht.md`** — Executive Summary, Findings nach Aspekt (mit Provenienz und Konfidenz nach Rubrik), Widersprüche, Adversariale Befunde, Lücken. Für den Leser.
- **`audit.md`** — Recherche-Plan (inkl. Revisionen), Recherche-Verlauf (Such-Strings, Verwerfungen, Tier-Korrekturen, ergebnislose Adversarial-Suchen, Re-Suchen), vollständige Quellenliste. Für Nachvollziehbarkeit und Fehlersuche. Formatierung dieses Teils darf ein Haiku-Subagent übernehmen (reine Strukturierung bereits vorliegender Daten).

Der Bericht verweist auf das Audit-Log, dupliziert es aber nicht.

## Pflichtregeln durchgängig

**Provenienz vor Eleganz.** Jede empirische Aussage muss zur Originalquelle zurückverfolgbar sein. Keine "laut einer Studie"-Floskeln.

**Konfidenz nach Rubrik, nicht nach Gefühl.** Die vierstufige Rubrik in `report-template.md` ist verbindlich. "Umstritten" ist eine valide Konfidenz, kein Versagen.

**Widersprüche ausweisen, nicht mitteln.** Konfligierende Zahlen oder Darstellungen sind ein Befund.

**Lücken benennen.** "Dazu existiert wenig Material" ist eine substanzielle Auskunft.

**Aktualität ist eine Dimension.** Aussagen mit Verfallsrisiko (Rechtslage, Statistik, Produktclaims, Personen in Funktionen) tragen einen Stichtag: "[Stand: Quelle 03/2024]". In der Lücken-Sektion prüfen: Gibt es Aussagen, deren jüngster Beleg alt ist, obwohl die Domäne schnelllebig ist?

**Zahlen-Präzision.** Jede Zahl im Bericht: exakter Wert + Einheit + Bezugszeitraum + Quelle. Keine gerundeten Paraphrasen ohne Kennzeichnung.

**Halluzinations-Verbot.** Bei Unsicherheit über den Inhalt einer Quelle: fetchen und nachprüfen oder als unverifiziert markieren. Nie raten.

**Marketing-Filter.** In Domänen mit kommerziellem Schaum: Engagement-Metriken sind kein Qualitätssignal; interne Konsistenz von Anbieter-Quellen ist ein Marketing-Effekt, kein Wahrheitsindikator.

**Echo vs. Konvergenz.** Abschreibende Quellen sind keine unabhängige Bestätigung.

**Budget- und Audit-Disziplin.** Tool-Calls zählen; Erschöpfung erzwingt ehrliche, unvollständige Synthese statt Endlositeration. Was gesucht, verworfen und umklassifiziert wurde, ist genauso berichtspflichtig wie die Ergebnisse.

**Domänen-Neutralität.** Beispiele und Aufzählungen domänen-divers halten; Häufung nur, wenn die Kernfrage sie begründet.

## Was dieser Skill nicht macht

- Keine Empfehlungen abseits des Recherche-Befunds.
- Keine eigene Meinung zu kontroversen Themen; Positionen werden referiert, methodisch bewertet (substanziell vs. schwach), nicht inhaltlich.
- Keine Vollständigkeitsversprechen.
- Keine mehrfachen Plan-Revisionen.
