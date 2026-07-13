---
name: tiefensuche
description: 'Strukturierte Tiefenrecherche mit Quellenvielfalt, Adversarial-Pass, expliziter Widerspruchsbehandlung und Lückenausweis. Nutze diesen Skill, wenn der User eine Frage stellt, die echte Recherche statt schneller Antwort braucht — also bei Begriffen wie "recherchiere", "finde heraus", "was wird zu X gesagt", "stimmt es dass…", "Hintergrund zu", oder bei Fragen zu kontroversen, nischigen oder schwer dokumentierten Themen. Liefert einen Markdown-Bericht mit Provenienz pro Aussage. Zwei Modi: --guided (mit zwei Pflicht-Pausen für Plan-Review und Triage), --auto (vollautomatisch, für Batch-Läufe oder Vergleichbarkeit mit autonomen Deep-Research-Systemen). NICHT verwenden bei: Faktenfragen mit klarer eindeutiger Antwort, reinem Brainstorming ohne Recherche-Bedarf, Schreibaufgaben ohne Quellenarbeit.'
---

# Tiefensuche

Strukturierte Recherche in sechs Phasen. Designt für Themen, bei denen schnelle Antworten täuschen — kontroverse Geschichte, Nischen-Wissen, Bereiche mit viel Marketing-Schaum, Fragen wo "was nicht gesagt wird" so wichtig ist wie "was gesagt wird".

## Aufrufmodi

Standard: `--guided` (mit User-Interaktion in Phase 1 und Phase 4). Erkennt der Skill, dass der User einen autonomen Lauf will (z.B. durch Formulierung "mach das alleine durch", "ohne Rückfrage", explizit `--auto`-Flag), wechselt er in den Auto-Modus und überspringt die Pausen. Im Auto-Modus trifft der Skill alle Entscheidungen selbst und dokumentiert sie im Bericht.

## Token-Budget und Failsafe

Tiefensuche kann in Phasen 2/3 in eine Iterationsschleife geraten, wenn die Quellenlage dünn ist. Um das zu verhindern, gilt ein hartes Tool-Call-Budget:

- **Auto-Modus:** maximal 80 Tool-Calls insgesamt (alle Web-Searches, Fetches, Memory-Lookups zusammengezählt).
- **Guided-Modus:** maximal 120 Tool-Calls insgesamt. Höher, weil der User durch Triage gezielt nachsteuern kann, ohne dass blind iteriert wird.

Der Skill zählt Tool-Calls intern mit. Bei 80% des Budgets wird in der nächsten Synthese-relevanten Phase ein Hinweis erzeugt: "Budget zu 80% erschöpft, Phase 5 wird priorisiert." Bei 100% des Budgets wird sofort Phase 6 forciert — mit den vorhandenen Daten, expliziter Markierung im Bericht ("Token-Budget erschöpft, Synthese auf Basis unvollständiger Recherche") und Auflistung der nicht abgeschlossenen Subqueries als Lücke.

**Untere Erschöpfungsschwelle.** Wenn nach Phase 5 der Tool-Call-Verbrauch unter 40% des Budgets liegt, prüfe vor Phase 6: Gehe die Plan-Selbstprüfung aus Phase 1 erneut durch — diesmal mit dem inzwischen aufgebauten Wissen. Hat sich seit der ursprünglichen Plan-Erstellung gezeigt, dass für eine der Selbstprüfungs-Fragen (Achsen-Abdeckung, Pflichtquellen-Adressierung, Adversarial-Substanz, Namensdoppelung-Check, externe Validierung) eine Subquery fehlt, die mit dem jetzigen Wissensstand naheliegend wäre? Dann führe diese fehlende Subquery durch — eine zusätzliche Such-Welle, klar im Audit-Log markiert.

Hintergrund: Vorzeitiges "Ich habe genug" ist eines der häufigsten Versagensmuster in Tiefenrecherche, besonders in Domänen mit reicher Quellenlage. Niedriger Budget-Verbrauch beim Phase-5-Ende ist ein Signal, dass die Plan-Generierung selbst zu sparsam war — nicht dass die Recherche bereits gründlich ist. Subjektive Sicherheit bei niedrigem Budgetverbrauch ist verdächtig, nicht beruhigend.

Diese Heuristik gilt nur einmal pro Lauf. Wenn nach der Zusatzwelle weitere Lücken sichtbar werden, wird das ehrlich im Bericht ausgewiesen, nicht durch dritte und vierte Wellen verfolgt.

Sekundärlimit Kontextgröße: Wenn der Volltext-Cache aus Phase 5 droht, das Modell-Kontextfenster zu sprengen, werden ältere Volltexte durch ihre Subquery-relevante Zusammenfassung ersetzt — der Provenienz-Eintrag (URL + Originalzitat) bleibt unverändert erhalten.

Diese Limits sind Failsafes, keine Zielwerte. Eine gute Recherche liegt typischerweise bei 25–50 Calls. Mehr ist meistens Symptom eines schlechten Plans aus Phase 1, nicht Symptom einer schwierigen Frage.

## Phase 0 — Cache & Scope

Bevor irgendein externer Tool-Call passiert:

1. Falls ein persistentes Memory-System verfügbar ist (z.B. OpenBrain, knowledge-base, memory-tool): suche dort mit der Kernfrage und 2-3 Synonymen. Wenn substanzielle Treffer existieren, präsentiere eine Kurzfassung und frage: "Reicht das, oder soll ich trotzdem extern recherchieren?" Im Auto-Modus: dokumentiere den Cache-Hit im Bericht und recherchiere trotzdem extern, falls die Frage nicht zu 100% beantwortet ist.

2. Klassifiziere die Frage entlang von drei Achsen, weil das Phase 1 strukturiert:
   - **Domäne** (Recht / Statistik / Tagesaktuelles / Wissenschaft / Technisches / Kulturelles/Esoterisch-Anfälliges / Mixed). Domäne entscheidet über Quellengewichtung.
   - **Streitigkeitsgrad** (etabliertes Wissen / kontrovers / aktiv umkämpft). Steigert das Adversarial-Budget in Phase 3.
   - **Dokumentationsdichte** (gut dokumentiert / fragmentiert / überwiegend mündlich oder vertraulich). Entscheidet, ob "Lücken sind OK" als Erwartung im Bericht stehen muss.

3. Lege Sprachvarianten fest. Zwei Achsen:
   - **Originalsprache der Quelle.** Bei Themen mit nicht-deutschen/englischen Primärquellen (z.B. arabische Rechtsquellen, chinesische Traditionen, japanische Philosophie, lateinamerikanische Sozialwissenschaft, russische Geschichtsforschung): plane Suchen in der Originalsprache mit ein, mindestens als transkribierte Eigennamen.
   - **Sprache des User-Praxiskontexts.** Wenn aus OpenBrain oder anderem Memory hervorgeht, dass der User selbst in einer bestimmten Sprache praktiziert oder arbeitet (z.B. deutschsprachige Berufspraxis, lokale Verbandsdokumentation, deutsche Fachpresse zu einer Methode): plane mindestens eine Subquery in dieser lokalen Sprache. Lokale Fachpresse, Vereinszeitschriften, Berufskammer-Veröffentlichungen und Schulen-Websites enthalten oft Information, die im internationalen Web nicht erscheint — gerade für Strömungen, Methoden oder Akteure, die international wenig Sichtbarkeit haben.

## Phase 1 — Plan

Generiere einen Recherche-Plan als strukturiertes JSON. Der Plan ist die wichtigste Phase — wenn er gut ist, funktioniert alles andere. Wenn er schlecht ist, hilft kein Schwarm.

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
      "priorität": "hoch/mittel/niedrig"
    }
  ],
  "erwartete_pflichtquellen": [
    "Quellen, die ein guter Lauf finden MUSS (auch wenn der User sie nicht explizit nennt)"
  ],
  "lueckenerwartung": "Wo erwarte ich, dass wenig Material existiert?"
}
```

Subqueries: 4-8 Stück. Mehr ist meist Overengineering, weniger ist meist Unterabdeckung. Jede Subquery muss einen *anderen* Aspekt der Kernfrage angehen, nicht denselben Aspekt mit anderen Worten.

**Pflicht-Subquery für lokale Sprache.** Wenn Phase 0 eine Sprache des User-Praxiskontexts identifiziert hat (z.B. deutschsprachige Berufspraxis, Verbandsarbeit oder Fachszene), MUSS mindestens eine Subquery explizit auf Quellen in dieser Sprache zielen — typischerweise Fachpresse, akademische Studien aus dem lokalen Sprachraum, Vereinszeitschriften, Verbandsdokumentation, Behörden- oder Kammer-Veröffentlichungen. Diese Subquery darf NICHT in einer "globalen" Subquery aufgehen, in der die deutschen Begriffe nur als Zusatz mitlaufen — sie braucht einen eigenen Slot mit dezidiert deutschen Suchstrings auf deutscher Fachpresse.

Konkret: NICHT akzeptabel ist eine englische Hauptsuche mit deutschen Synonymen als Begleitsuche. Akzeptabel ist eine eigene Subquery mit expliziter Erwartung, deutschsprachige Fachveröffentlichungen zu finden — etwa Suchstrings der Form "[Methode] Fachzeitschrift deutsch", "[Thema] akademische Studie Deutschland", "[Akteur] Verbandszeitschrift", oder gezielt auf bekannten deutschen Fachverlagen, Hochschul-Repositorien oder Verbandsseiten.

### Plan-Selbstprüfung (vor jedem weiteren Schritt)

Bevor der Plan dem User präsentiert (Guided) oder direkt umgesetzt (Auto) wird, prüfe ihn gegen drei harte Kriterien:

1. **Achsen-Abdeckung:** Decken die Subqueries alle drei Achsen aus Phase 0 ab — die Domänen-Aspekte (z.B. bei "kulturell": Geschichte + aktuelle Praxis + Kritik), den Streitigkeitsgrad (gibt es eine Subquery für umstrittene Aspekte?), und die Dokumentationslage (gibt es eine Subquery, die in Bereichen mit dünner Quellenlage gezielt gräbt)?
2. **Pflichtquellen-Adressierung:** Gibt es für jede Quelle in `erwartete_pflichtquellen` mindestens eine Subquery, die diese Quelle plausibel finden kann?
3. **Adversarial-Substanz:** Sind die `adversarial_variante`-Felder *echt* gegenpositionierte Suchen, oder bloß Umformulierungen? Test: würde jemand, der die Hauptthese ablehnt, mit diesen Begriffen suchen? Wenn die Adversarial-Variante syntaktisch fast identisch zur Hauptsuche ist, ist sie keine Adversarial-Variante.
4. **Namensdoppelung-Check:** Bei Domänen mit hoher Wahrscheinlichkeit für Namensgleichheit unabhängiger Schulen, Traditionen oder Methoden (alphabetisch: alte Handwerksschulen, Esoterik, Heilmethoden, Kampfkünste, Markennamen mit kollidierenden Linien, religiöse/spirituelle Bewegungen, traditionelles Wissen): habe ich geprüft, ob mehrere unabhängige Stränge denselben Namen tragen können? Falls ja oder unklar: ist das eine eigene Subquery, die nach parallelen Linien sucht? Muster: Wenn ein Eigenname in zwei voneinander unabhängigen Traditionen geführt wird — etwa eine nördliche und eine südliche Linie ohne gemeinsame Genealogie, oder ein historisch früher und ein modern wiederbelebter Strang — übersieht eine Suche, die nur auf der international sichtbareren Linie ankert, möglicherweise die andere komplett. Suchstrings dafür: "alternative [Name]", "second [Name]", "[Name] disambiguation", "[Name] separate lineage".
5. **Externe Validierung:** Bei Domänen mit hohem Marketing-Schaum (alphabetisch: AI-Produktclaims, alternative Medizin, Esoterik, Heilmethoden, Kampfkünste, Krypto-Projekte, Wellness): Habe ich eine Subquery, die nach *unabhängig validierten* Daten sucht — regulierte Wettkämpfe, externe Audits, peer-reviewte Studien, gerichtliche oder regulatorische Stellungnahmen, öffentlich dokumentierte Vorfälle? Ohne solche Subquery droht der Bericht, sich auf Selbst-Marketing der Linie, Schule oder Anbieter zu stützen und sich zu früh "fertig" zu fühlen, weil die internen Quellen alle konsistent klingen — was ein Marketing-Konsistenz-Effekt ist, kein Wahrheitsindikator. Beispiel-Muster aus mehreren Domänen: bei einem Heilverfahren nach Cochrane-Reviews oder Stellungnahmen von Ärzte- oder Apothekerkammern; bei einem Krypto-Projekt nach Smart-Contract-Audits, Insolvenzregister-Einträgen oder Verfahren von Aufsichtsbehörden (BaFin, SEC); bei einer Tradition oder Methode mit Wettbewerbsdimension nach Ergebnissen aus regulierten Wettkämpfen oder dokumentierten Vorfällen mit externer Beweislage. Der Punkt ist nicht das Format — der Punkt ist, dass eine eigenständig validierende Außenperspektive erzwungen wird, statt nur die Selbstbeschreibung der Domäne zu spiegeln.
6. **Domänen-Neutralität:** Sind die Beispiele, Suchbegriffe und Domänen-Aufzählungen in den Subqueries nicht systematisch aus einer einzelnen Domäne gezogen, nur weil diese in der unmittelbar vorherigen Konversation, im Memory-Lookup oder in der Skill-Iterations-Geschichte präsent war? Konkret: Wenn der Plan eine Domäne (Kampfkunst, Recht, Medizin, Technik etc.) auffällig häufig nennt, prüfe — ist das in der Kernfrage selbst begründet, oder ist es Recency-Verzerrung aus dem Kontext? Bei Recency-Verzerrung: Beispiele domänen-divers ersetzen, Listen alphabetisch sortieren, Erstnennungs-Position prüfen.

   Hintergrund: LLMs entwickeln in Iterations-Sessions schwer sichtbar Domänen-Drift, weil das jüngste Beispiel mental verfügbar ist und automatisch als "naheliegend" empfunden wird. Diese Verfügbarkeit ist kein Argument für Relevanz. Der Check ist auch dann durchzuführen, wenn der Plan inhaltlich plausibel wirkt. Wichtige Einschränkung: Bei einer Frage, die selbst domänenspezifisch ist (z.B. konkrete Frage zu einer bestimmten Methode, Tradition oder Schule), ist Domänen-Häufung erwartbar und korrekt — der Check fängt *Bias* ab, nicht *Fokus*.

Wenn ein Kriterium nicht erfüllt ist: Plan revidieren *bevor* Phase 2 startet. Maximal eine Revision in dieser Phase — wenn auch der revidierte Plan an einem Kriterium scheitert, dokumentiere die Schwäche im Bericht (Sektion "Recherche-Plan") und fahre fort.

**Im --guided Modus:** Präsentiere den (ggf. revidierten) Plan dem User mit der Frage: "Plan sieht so aus. Was streichen, was ergänzen, welche Subquery anders fokussieren?" Warte auf Antwort. Passe den Plan entsprechend an.

**Im --auto Modus:** Speichere den Plan im finalen Bericht (Sektion "Recherche-Plan"). Der User kann später nachvollziehen, was du gesucht hast und was nicht.

## Phase 2 — Parallel Broad Search

Pro Subquery: parallel mehrere Backends abfragen. Welche Backends verfügbar sind, hängt von der Umgebung ab. Mindestkonfiguration:

- Eine Web-Suche (native WebSearch, oder externes Backend wie Exa/Parallel/Brave falls verfügbar)
- Ein Fetch-Tool für Volltext (WebFetch oder agent-browser)

**Backend-Routing nach Domäne (aus Phase 0):**

Die Domänen-Klassifikation entscheidet, welche zusätzlichen Backends in Phase 2 mitlaufen. Damit landet jede Subquery bei den Engines, die sie wahrscheinlich finden, ohne flächendeckend Token zu verbrennen.

| Domäne | Standard-Backends | Zusätzlich (wenn verfügbar) |
|---|---|---|
| Wissenschaft / Technisches | WebSearch + Fetch | **SearxNG** mit Wissenschafts-Profil (siehe „SearxNG-Aufruf-Konvention" am Ende) |
| Recht | WebSearch + Fetch | Rechtsrecherche-MCP (NeuRIS, EUR-Lex, GII) — falls die Frage in eine seiner Collections fällt |
| Statistik | WebSearch + Fetch | Arbeitsmarkt-MCP (BA-Statistik, GENESIS, Regionalstatistik, Dashboard-Indikatoren) |
| Tagesaktuelles / Kulturelles / Mixed | WebSearch + Fetch | Keine Spezial-Backends per Default |

Wenn mehrere Suchquellen verfügbar sind: nutze sie *parallel* in einem Turn (mehrere Tool-Calls gleichzeitig), nicht sequenziell. Auch die Sprachvarianten parallel: deutsche und englische Suche im selben Turn.

**Output dieser Phase ist eine strukturierte Treffertabelle**, kein Prosa:

| Subquery | URL | Titel | Datum | Backend | Tier-Schätzung | Snippet (max 30 Wörter) |
|---|---|---|---|---|---|---|

**Such-Strings für Audit-Log notieren.** Pro Subquery die *tatsächlich* abgesetzten Such-Strings (nicht nur die Begriffe aus dem Plan, sondern wie sie konkret an das Backend gingen, inklusive Operatoren oder Anführungszeichen falls verwendet) sowie die Trefferanzahl pro Backend protokollieren. Diese Information fließt in Phase 6 in die Sektion "Recherche-Verlauf".

Tier-Schätzung:
- **T1** Primärquelle (Originaldokument, Gesetzestext, peer-reviewed Studie, Originalzitat)
- **T2** Sekundärquelle (Fachjournalismus, etablierter Researcher, offizielle Stelle)
- **T3** Tertiärquelle (Mainstream-Medien, Wikipedia, Erklärartikel)
- **T4** Community/Forum (Reddit, X, Foren — relevant für Perspektiven, vorsichtig bei Fakten)
- **T?** Unklar — flag für Phase 3

Jede Aussage in einem Snippet muss aus dem Quelltext stammen, nicht halluziniert sein. Wenn unklar: T? markieren und in Phase 5 fetchen.

## Phase 3 — Convergence + Adversarial

Drei Schritte, in dieser Reihenfolge:

**Schritt 1 — URL- und Aussagen-Konvergenz.** Identifiziere Treffer, die im Kern dieselbe Aussage machen. Wenn drei unabhängige Quellen — idealerweise aus unterschiedlichen Sprachräumen, Schulen, Medien — übereinstimmen, ist das ein starkes Konfidenz-Signal. Markiere konvergente Cluster im Tabellen-Output (z.B. "Cluster A: Aussagen über Lineage-X, gefunden in Quelle 3, 7, 14").

**Wichtige Einschränkung:** Echo-Detection. Wenn fünf englische Webseiten alle vom selben Wikipedia-Artikel oder derselben Hauptquelle abschreiben, ist das *keine* Konvergenz. Versuche zu erkennen, ob Quellen eigenständig sind oder zitieren. Bei Unsicherheit: niedrigere Konfidenz.

**Schritt 2 — Adversarial-Pass.** Adversarial hat zwei Modi, und beide sind durchzuführen, wenn das Phänomen plausibel ist:

(a) **Gegenpositions-Suche.** Wenn Phase 2 die These "X ist Y" stützt, suche jetzt aktiv nach Quellen, die "X ist nicht Y" behaupten — klassische Adversarial-Logik. Kritik, Skepsis, Widerlegung der Hauptbefunde.

(b) **Vollständigkeits-Suche.** Suche nach Quellen, die zeigen, dass die Hauptthese *unvollständig* ist — etwa durch Existenz alternativer, unabhängiger Linien mit gleichem Namen, paralleler Stilrichtungen, abweichender Tradierungswege, konkurrierender Schulen, die in der bisher gefundenen Hauptlinie nicht erwähnt werden. Suchbegriffe: "alternative [Name]", "second [Name]", "northern/southern [Name]", "[Name] Variante", "andere [Name]-Linie", konkurrierende Eigennamen. Dieser Modus ist besonders wichtig in Domänen mit alten, fragmentierten oder konkurrierenden Traditionen (alphabetisch: Esoterik, Heilmethoden, Kampfkünste, religiöse und spirituelle Strömungen, traditionelle Wissensbestände) — also überall, wo Modus (a) eine systemimmanente Schwäche hat: Wer ein System nur in seiner Hauptlinie kennt, sucht Kritik daran und übersieht, dass es daneben andere unabhängige Systeme gleichen Namens gibt.

Adversarial-Treffer kommen in eine separate Sektion der Treffertabelle. Auch Adversarial-Suchen ohne brauchbares Ergebnis werden ins Audit-Log geschrieben — die Information "wir haben gegengesucht und nichts gefunden" ist substantiell.

**Schritt 3 — Lücken-Inventur.** Vergleiche die `erwartete_pflichtquellen` aus Phase 1 mit den tatsächlich gefundenen. Was fehlt? Wo sind blinde Flecken? Liste explizit auf — diese Liste fließt später in den Bericht.

**Schritt 3a — Lücken-Schließer (gezielter Spezial-Engine-Aufruf).** Nach der Lücken-Inventur: Wenn eine erwartete Pflichtquelle einer spezifischen Quellgattung entspricht, die ein Spezial-Backend abdeckt, mache einen *gezielten* Folge-Aufruf — nicht eine erneute Broad Search. Beispiele:

- Akademisch fehlt (peer-reviewed Studie, ArXiv-Paper, PubMed-Eintrag) → SearxNG-Aufruf nur mit den jeweils passenden Engines (`engines=arxiv,pubmed,crossref,semantic+scholar`), max 1 Call pro fehlender Quellgattung.
- Code/Repository fehlt → SearxNG mit `engines=github,gitlab,codeberg`.
- Forenwissen / community knowledge fehlt → SearxNG mit `engines=stackoverflow,askubuntu,superuser`.
- Faktenbasis fehlt (Wikipedia/Wikidata) → SearxNG mit `engines=wikipedia,wikidata`.

Diese gezielten Aufrufe zählen ins Tool-Call-Budget. Dokumentiere im Audit-Log: welche Lücke, welche Engines, welcher Suchstring, was kam zurück. Wenn auch der gezielte Aufruf null brauchbare Treffer liefert: das ist ein substantieller Befund für den Bericht („Lücke konnte auch mit Spezial-Suche nicht geschlossen werden — wahrscheinlich existiert das Material nicht").

## Phase 4 — Triage

**Im --guided Modus:** Präsentiere dem User die Treffertabelle (gekürzt — Top 15-20 Treffer plus alle Adversarial-Treffer plus alle T1-Quellen). Frage: "Welche Treffer als irrelevant verwerfen, welche vertieft fetchen, welche Subquery hat keine guten Treffer und braucht einen zweiten Versuch?"

Warte auf Antwort. Wenn der User Re-Suchen will: zurück zu Phase 2 für die markierten Subqueries mit angepassten Suchbegriffen.

**Im --auto Modus:** Triage selbst. Regel: Top-3 pro Subquery + alle T1 + alle Adversarial + alle T? für Verifikation. Wenn eine Subquery weniger als 2 brauchbare Treffer hat: einmal automatisch nachsuchen mit modifizierten Begriffen. Mehr als einmal nicht — sonst Endlosschleife-Risiko. Pro verworfenem Treffer den Verwerfungsgrund kurz notieren (z.B. "Marketing-Schaum, kein Faktengehalt"; "Echo von Quelle X"; "thematisch off-topic trotz Treffer auf Suchbegriff") — fließt ins Audit-Log.

### Strukturelles Plan-Versagen erkennen

Bevor du in Phase 5 weitergehst, prüfe nach der Triage: Wie viele Subqueries haben *keine* brauchbaren Treffer (weder T1-T3 noch Adversarial)? Wenn das **mehr als die Hälfte** der Subqueries betrifft, war wahrscheinlich der Plan strukturell falsch — nicht nur die Suche schwach. Reaktion:

- **Einmal (und nur einmal)** zurück zu Phase 1 für eine Plan-Revision: andere Subquery-Aspekte, andere Sprachvarianten, andere Quellgattungen. Im Guided-Modus mit User-Bestätigung, im Auto-Modus mit Begründung im Bericht.
- Nach der Plan-Revision wieder durch Phase 2 → 3 → 4. 
- Wenn auch der revidierte Plan in Phase 4 die >50%-Schwelle reißt: nicht ein drittes Mal versuchen. Stattdessen direkt zu Phase 5/6 mit den vorhandenen Treffern und expliziter Notiz im Bericht: "Plan-Revision auch im 2. Anlauf nicht erfolgreich. Wahrscheinliche Ursache: extrem dünne Quellenlage zur Kernfrage. Synthese basiert auf unvollständigem Material."

Diese Schleife ist absichtlich auf einen Durchlauf begrenzt. Mehrfache Plan-Revisionen sind ein Symptom dafür, dass die Frage selbst neu formuliert werden muss — das ist Aufgabe des Users, nicht des Skills.

## Phase 5 — Deep Fetch

Für die in Phase 4 markierten Treffer: Volltext fetchen. Pro gefetchter Quelle:

1. Volltext lesen (oder bei sehr langen Dokumenten: gezielt die Sektionen, die für die Subquery relevant sind).
2. **Provenienz-Eintrag erzeugen.** Pro relevanter Aussage: Originalzitat (max 20 Wörter, kein Copyright-Verstoß), URL, ggf. Seitenzahl/Sektion.
3. **Tier-Verifikation.** Stimmt die Tier-Schätzung aus Phase 2? Korrigiere bei Bedarf. Jede Korrektur (z.B. "T2 → T3, weil bei Volltext-Lese sich herausstellte, dass die Quelle ein Aggregator ist") wird ins Audit-Log geschrieben.

Wichtig: Nicht jede gefetchte Quelle landet im Bericht. Manche Fetches dienen nur der Verifikation oder dem Ausschluss. Dokumentiere auch die Ausschlüsse kurz.

## Phase 6 — Synthese

Erzeuge den finalen Bericht in folgender Markdown-Struktur:

```markdown
# Tiefenrecherche: [Kernfrage]

**Modus:** guided / auto
**Domäne:** [aus Phase 0]
**Backends genutzt:** [Liste]
**Tool-Calls verbraucht:** [Zahl] / [Budget]
**Plan-Revisionen:** [0 oder 1]
**Konfidenz Gesamtbild:** hoch / mittel / niedrig

## Executive Summary
3-5 Sätze. Jeder Satz mit Konfidenz-Markierung in eckigen Klammern: [hoch], [mittel], [niedrig], [umstritten].

## Findings nach Aspekt

### [Aspekt 1, z.B. "Historische Ursprünge"]

[Aussage in eigener Formulierung] [Konfidenz-Markierung]
> "Originalzitat" — Quellenname, [URL]

[Nächste Aussage…]

### [Aspekt 2…]

…

## Widersprüche und konkurrierende Positionen

Wenn Quellen konfligieren: hier ausweisen, nicht mitteln.

| Aussage | Position A | Position B | Bewertung |
|---|---|---|---|
| … | Quelle X behauptet… | Quelle Y behauptet… | unentschieden / A überzeugender weil… |

## Adversariale Befunde

Was haben Quellen gesagt, die der Hauptthese widersprechen? Welche dieser Einwände sind substantiell, welche sind schwach?

## Lücken und offene Fragen

Was haben wir nicht gefunden? Wo war die Quellenlage zu dünn? Welche Pflichtquellen aus Phase 1 fehlen — und ist das ein Recherchefehler oder existiert das Material schlicht nicht? Bei abgebrochenem Lauf (Budget oder Plan-Revision-Limit erreicht): hier ausführen, was *nicht* fertig recherchiert wurde.

## Recherche-Plan (zur Nachvollziehbarkeit)

[JSON-Plan aus Phase 1, ggf. mit User-Anpassungen oder Plan-Revisionen — bei Revision beide Pläne ausweisen]

## Recherche-Verlauf (Audit-Log)

Hier wird dokumentiert, wie tatsächlich gesucht wurde — getrennt vom Plan, der nur die Absicht zeigt. Pro Subquery:

- **Tatsächlich abgesetzte Such-Strings** (pro Backend, mit Trefferanzahl)
- **Verworfene Treffer mit Verwerfungsgrund** (irrelevant / Echo / Marketing / off-topic / etc.)
- **Tier-Korrekturen** in Phase 5 (welche Quelle wurde von welchem Tier auf welches umklassifiziert, mit Begründung)
- **Adversarial-Suchen** die nichts brachten (Suchbegriffe + "0 brauchbare Treffer")
- **Re-Suchen** in Phase 4 (welche Subquery, mit welchen modifizierten Begriffen)

Diese Sektion ist für die Fehlersuche nach dem Lauf gedacht — wenn der Bericht eine Aussage nicht ausreichend belegt, soll hier sichtbar sein, was versucht wurde und was nicht.

## Vollständige Quellenliste

Alle URLs, gruppiert nach Tier, mit Datum des Aufrufs.
```

## Pflichtregeln durchgängig

**Provenienz vor Eleganz.** Lieber ein hässlicher Bericht mit lückenloser Quellenangabe als ein schöner Bericht ohne Nachvollziehbarkeit. Jede empirische Aussage muss zur Originalquelle zurückverfolgbar sein. Keine "laut einer Studie"-Floskeln.

**Konfidenz ist ein Datum.** Nicht alles was im Bericht steht, ist gleich sicher. Markiere ehrlich. "Umstritten" ist eine valide Konfidenz, nicht ein Versagen.

**Widersprüche werden ausgewiesen, nicht versteckt.** Wenn zwei Quellen unterschiedliche Zahlen oder Daten nennen: Dissens als Befund darstellen, nicht eine willkürlich wählen.

**Lücken werden benannt.** "Dazu existiert wenig Material" ist eine substantielle Auskunft — sie bewahrt den User vor falscher Sicherheit.

**Halluzinations-Verbot.** Wenn unsicher, was eine Quelle sagt: nicht raten. Entweder fetchen und nachprüfen, oder die Aussage als unverifiziert markieren.

**Marketing-Filter aktiv.** In Domänen mit viel kommerziellem Schaum (alphabetisch: AI-Produktclaims, alternative Medizin, Esoterik, Kampfkünste, Krypto-Projekte, Wellness): vorsichtig mit Engagement-Metriken als Qualitätssignal. Viele Likes können ein Negativsignal sein.

**Echo vs. Konvergenz.** Mehrere Quellen, die voneinander abschreiben, sind keine unabhängige Bestätigung. Bei Verdacht: niedrigere Konfidenz.

**Budget-Disziplin.** Tool-Calls werden mitgezählt. Budget-Erschöpfung führt zu forcierter Synthese, nicht zu Endlositeration. Eine unvollständige, ehrliche Synthese ist besser als eine vollständige, halluzinierte.

**Audit-Log-Disziplin.** Was tatsächlich gesucht, verworfen und umklassifiziert wurde, ist genauso berichtspflichtig wie die finalen Ergebnisse. Das Audit-Log macht Fehler nachvollziehbar — eine schlechte Recherche mit transparentem Verlauf ist besser als eine schlechte Recherche, die wie ein guter Bericht aussieht.

**Domänen-Neutralität.** Tiefensuche ist domänen-agnostisch. Beispiele und Aufzählungen sollen nicht systematisch eine Domäne bevorzugen — weder durch häufige Nennung, durch Erstnennungs-Position in Listen, noch durch ausschließlich aus einer Domäne gezogene konkrete Beispiele. Wenn der Plan oder der Bericht eine Domäne auffällig häufig adressiert, muss das in der Kernfrage selbst begründet sein, nicht in der Iterations-Geschichte des Skills.

## Was dieser Skill nicht macht

- Keine Empfehlungen abseits des Recherche-Befunds. Wenn der User danach handeln will, ist das seine Sache.
- Keine eigene Meinung zu kontroversen Themen. Positionen werden referiert, nicht bewertet — außer im methodischen Sinn (substantiell vs. schwach).
- Keine Vollständigkeitsversprechen. Tiefenrecherche heißt: gründlich gesucht, ehrlich berichtet, nicht erschöpfend.
- Keine mehrfachen Plan-Revisionen. Wenn ein zweiter Plan auch versagt, ist die Frage selbst zu prüfen — das ist Aufgabe des Users.

## Backend-Aufruf-Konventionen

### SearxNG (lokale Meta-Suchmaschine)

SearxNG aggregiert ~25 spezialisierte Engines. Für Tiefensuche relevant: ArXiv, PubMed, Crossref, Semantic Scholar, Wikipedia, Wikidata, GitHub, Stackoverflow/AskUbuntu/Superuser, sowie Web-General (Brave, Mojeek, Qwant, DuckDuckGo).

**Erreichbarkeit:**

- Aus dem Host (z.B. Claude Code direkt): `http://127.0.0.1:8888/`
- Aus einem NanoClaw-Container: `http://172.17.0.1:8888/`

**JSON-API-Aufruf:**

```bash
curl -sS "http://172.17.0.1:8888/search?q=<urlencoded-query>&engines=<engine-list>&format=json"
```

Wichtige Parameter:

- `q` — Suchterm, URL-encoded; Anführungszeichen für Phrasen erlaubt (`"exact phrase"`)
- `engines` — Komma-getrennte Engine-Liste (kein Leerzeichen). Engine-Namen mit Leerzeichen (z.B. `semantic scholar`) als `semantic+scholar` schreiben. Ohne `engines`-Parameter werden alle aktiven Engines abgefragt — für Tiefensuche fast nie sinnvoll.
- `format=json` — strukturierte Antwort statt HTML
- Optional: `language=de` / `language=en` / `language=auto`, `time_range=year` (oder `month`, `week`, `day`)

**Engine-Profile (Empfehlung pro Phase-2-Domäne):**

| Profil | Engines |
|---|---|
| Wissenschaft | `arxiv,pubmed,crossref,semantic+scholar,google+scholar,openairepublications` |
| Tech / Code | `github,gitlab,codeberg,stackoverflow,askubuntu,superuser` |
| Faktenbasis | `wikipedia,wikidata` |
| Web-General (privacy-freundlich) | `brave,mojeek,qwant,duckduckgo` |

**Antwort-Struktur (JSON):**

```json
{
  "query": "...",
  "number_of_results": 0,
  "results": [
    {
      "engine": "arxiv",
      "title": "...",
      "url": "...",
      "content": "snippet",
      "publishedDate": "..."
    }
  ],
  "answers": [],
  "infoboxes": [],
  "suggestions": []
}
```

`results[].engine` → ins Audit-Log; `results[].url` → Tier-Schätzung (T1 für ArXiv/PubMed/Crossref, T3 für Wikipedia, T4 für Stackoverflow/Foren); `results[].publishedDate` falls vorhanden in die Treffertabelle als `Datum`.

**Limits und Etikette:**

- 5 Sek Default-Timeout pro Engine; eine einzelne 403-Engine bricht den Gesamtaufruf nicht ab
- Bei wiederholten 403/429 von einer Engine: SearxNG suspended sie automatisch für 180 s — kein Retry sinnvoll
- Lieber gezielt 4-6 Engines als alle 25 — sonst wird die Antwort breit und langsam

**Wenn SearxNG nicht antwortet:** Health-Check `curl -sS http://172.17.0.1:8888/healthz` (sollte `OK` liefern). Bei Ausfall: Phase 2 läuft mit den anderen Backends weiter, im Audit-Log notieren („SearxNG nicht erreichbar — fallback auf WebSearch only").
