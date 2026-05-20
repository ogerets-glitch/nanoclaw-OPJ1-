---
name: openbrain
description: "Olivers persönliches KI-Gedächtnis und Dokumenten-RAG. Nutze IMMER, wenn etwas in OpenBrain gespeichert, gesucht, aktualisiert, verstärkt oder gelöscht werden soll, oder bei Begriffen wie 'OpenBrain', 'merk dir', 'speicher das', 'ins Gedächtnis', 'notier dir', 'erinner dich an', 'was weißt du über', 'such in OpenBrain', 'verstärke', 'reinforce'. Auch bei 'Was haben wir zu X besprochen?', 'Hast du Erinnerungen an...', 'Schreib das in dein Gedächtnis', oder wenn andere Agents (OPJ1, Claude Code, Cowork) etwas dauerhaft festhalten wollen. Triggert beim Speichern beliebiger Inhalte — Notizen, Rezepte, Artikel, Reflexionen, technische Erkenntnisse, Beobachtungen. Triggert auch bei Such-Anfragen in eigenen kDrive-Dokumenten ('such in meinen PDFs', 'was steht in [Dokument]', 'durchsuche meine Quellen'), außer bei juristischer Paragrafenrecherche (→ Rechtsrecherche-Skill). NICHT bei: juristischer Paragrafenrecherche, reiner Konversation ohne Speicher- oder Suchabsicht."
---

# OpenBrain — Persistentes KI-Gedächtnis und Dokumenten-RAG

OpenBrain ist Olivers selbst gehostetes Memory- und RAG-System. Es läuft als FastMCP-Server auf seinem Hetzner-VPS unter `openbrain-oliver.kozow.com`. Speicher: PostgreSQL mit pgvector (semantisch), pg_search (BM25), RRF-Fusion, bge-reranker-v2-m3 (zweite Stufe).

Zwei Datenklassen, **eine** Infrastruktur:

- **Memories** — kuratierte Einträge (Notizen, Erkenntnisse, Präferenzen, Beobachtungen). Werden von Agents geschrieben.
- **Documents** — automatisch indexierte Quellen aus dem kDrive (PDFs, DOCX, Audio-Transkripte). Werden über kdrive-bridge zugespielt.

Beide Datenklassen haben eigene Tools mit eigenen Workflows. Verwechseln wäre teuer: `search_memory` durchsucht Notizen, `search_documents_tool` durchsucht Quellen-PDFs.

Es ist das **eine** persistente Memory-System für alle Agents — Alfred (Claude.ai), OPJ1/NanoClaw (Telegram), Claude Code und Cowork.

## Leitlinie: Klassifizieren statt Filtern

Die alte Torwächter-Regel ist abgeschafft (gültig ab 15.04.2026). **Jede Form von Text kann gespeichert werden** — MAV-Notizen, Kochrezepte, Substack-Artikel, Studien-Zusammenfassungen, technische Erkenntnisse, philosophische Reflexionen, persönliche Beobachtungen. Die Qualitätssicherung passiert beim Suchen (Tag-Filter + Reranker), nicht beim Schreiben.

**Kein eigenmächtiges Filtern.** Wenn Oliver oder ein Agent etwas speichern will, speicherst du es — nicht „brauchen wir das wirklich?" abfragen. Die Soft-Warnung bei sehr langen Inhalten (> 1000 Wörter) ist der einzige Reibungspunkt.

## Wann triggern?

**Triggert bei (Auswahl, nicht erschöpfend):**

- „merk dir", „speicher das", „notier dir", „behalt das"
- „ins Gedächtnis", „in OpenBrain", „in dein Gedächtnis"
- „erinner dich an", „such in OpenBrain", „schau im Gedächtnis"
- „was weißt du über X", „hast du Erinnerungen an...", „was haben wir zu Y besprochen"
- „verstärke", „reinforce", „das war hilfreich" (→ `reinforce_memory`)
- „aktualisier den Eintrag", „lösch aus dem Gedächtnis"
- „such in meinen Dokumenten/PDFs", „was steht in [Dokument]", „im kDrive suchen" → Dokumenten-Tools
- „welche Collections gibt es", „wie viel ist in OpenBrain" → Inspektion-Tools
- jede Aussage Olivers, die wie eine festzuhaltende Erkenntnis, Präferenz, Beobachtung oder ein Ereignis klingt — auch ohne explizite Speicheranweisung, wenn der Inhalt erkennbar Wert für künftige Konversationen hat

**Triggert NICHT bei:**

- juristischen Quellen mit Paragraf, Aktenzeichen, Gerichtsurteil → Rechtsrecherche-Skill (der nutzt zwar `search_documents_tool` und `search_memory` von OpenBrain mit, aber die Workflow-Steuerung gehört dorthin)
- reiner Konversation ohne Speicher- oder Suchabsicht

## MCP-Werkzeuge

Aktuell 15 Tools, gruppiert nach Funktion.

### Memory-Tools (kuratierte Einträge)

| Tool | Zweck | Wichtige Parameter |
|------|-------|---------------------|
| `add_memory` | Neuer Eintrag. Wenn keine Tags übergeben werden, generiert der Server selbst welche via Ministral 3 (Auto-Metadaten). Wir setzen aber bewusst eigene Tags — kuratierte Tags sind verlässlicher als automatische. | `content` (Pflicht), `tags`, `author`, `visibility`, `source` |
| `search_memory` | Hybrid-Suche mit Reranking. Trailing `/` im Tag = Prefix-Match. | `query` (Pflicht), `agent`, `tags` (AND-Filter), `limit`, `offset` |
| `update_memory` | Partial-Update. Bei `content`-Änderung wird das Embedding neu generiert. | `id` (Pflicht), `content`, `tags`, `author`, `visibility` |
| `reinforce_memory` | hit_count um 1 erhöhen — Verstärkungs-Signal für das Ranking. | `id` (Pflicht) |
| `delete_memory` | Eintrag löschen. **Nur auf explizite Anweisung Olivers.** | `id` (Pflicht) |

### Document-Tools (kDrive-RAG)

| Tool | Zweck | Wichtige Parameter |
|------|-------|---------------------|
| `search_documents_tool` | Hybrid-Suche in Quellen-Chunks (PDFs, DOCX, Audio-Transkripte aus kDrive). Liefert pro Treffer Volltext-Chunk (~1000 Zeichen), Seitenzahl, `document_id`, `collection`, `rrf_score`. Ohne `collection`-Filter: über alle Collections. | `query` (Pflicht), `collection`, `limit` |
| `list_collections` | Alle aktuell genutzten Collection-Namen mit Count. Collections entstehen automatisch aus kDrive-Subordnern (z.B. `/OpenBrain-Inbox/Rechtsrecherche/MAV/` → `rechtsrecherche/mav`). | keine |
| `get_full_document` | Vollständiger Text eines Dokuments (chunk_index 0..N konkateniert). Bei > 50 Chunks wird `truncated: true` gesetzt — via `offset` weiterblättern. | `document_id` (Pflicht), `limit`, `offset` |
| `rag_search` | v1-kompatibler Alias auf `search_documents_tool` mit Collection-Mapping `collection_a` → `rechtsrecherche/mav`, `collection_b` → `rechtsrecherche/sozialrecht`. | `query` (Pflicht), `collection`, `top_k` |
| `delete_document` | Quell-Dokument + alle zugehörigen Chunks löschen (CASCADE). **Wird typischerweise von kdrive-bridge bei kDrive-deleted-Events gerufen. Nicht eigenmächtig aufrufen.** | `kdrive_path` (Pflicht) |

### Inspektions-Tools (Übersicht und Pflege)

| Tool | Zweck | Wichtige Parameter |
|------|-------|---------------------|
| `list_tags` | Tag-Vokabular mit Count. Optional `prefix` für Hierarchie-Browsing. | `prefix`, `limit` |
| `get_stats` | Gesamt-Statistiken: Anzahl Memories/Documents/Chunks, Top-Collections. | keine |
| `browse_recent` | Chronologische Memory-Ansicht (neueste zuerst). | `limit`, `offset` |
| `get_top_memories` | Memories mit hoher hit_count (oft verstärkt). | `limit`, `min_hits` |
| `get_stale_memories` | Memories, die seit N Monaten nicht abgerufen wurden — Kandidaten für Review/Löschung. | `months` (Default 6), `limit` |

## Tagging-Protokoll vor jedem `add_memory`

Tags werden vom aufrufenden LLM **vor** dem Speichern generiert. Ohne Tags ist ein Eintrag schwer wieder auffindbar. Auto-Metadaten via Ministral 3 ist nur ein Fallback — kuratierte Tags sind besser.

### Leitmaßstab: Retrieval-Qualität

**Der einzige Maßstab für einen Tag ist: Hilft er, diesen Eintrag später eindeutig wiederzufinden?**

Konkret heißt das: Nach dem Setzen der Tags stelle dir vor, du suchst in 4 Wochen nach genau diesem Inhalt. Liefert eine Suche mit diesen Tags den Eintrag zielsicher — oder landet er in einer Liste von 10 anderen Einträgen, zwischen denen du nicht mehr unterscheiden kannst? Wenn Letzteres: Tags sind zu generisch.

### Inhalts-Tags vs. Kontext-Tags

**Inhalts-Tags** benennen das, worum es im Eintrag *thematisch* geht — das konkrete Lemma, den Paragrafen, das Konzept, das Werkzeug, die Person.
  Beispiele: `Datenschutz/DSFA`, `MAV/Überlastungsanzeige`, `Pi-Agent/Extension-Konflikt`, `Recht/AVR-Einstufung`, `Rezept/Butterkuchen`.

**Kontext-Tags** beschreiben *Herkunft, Form oder Meta-Eigenschaften* des Eintrags — woher er kommt, wer ihn geschrieben hat, welchen Zweck er im System erfüllt.
  Beispiele: `operative-Anweisung`, `Reflexion/OPJ1`, `Lektüre/Tageslesung`, `OpenBrain/Session-Protokoll`, `Wartung/erledigt`.

**Regel:** Jeder Eintrag braucht **mindestens einen differenzierenden Inhalts-Tag**. Kontext-Tags sind erlaubt, aber sparsam — nur setzen, wenn sie zusätzlich zum Inhalts-Tag echten Mehrwert beim Wiederfinden bringen. Ein Eintrag, der nur Kontext-Tags hat, ist faktisch nicht gezielt auffindbar.

**Anti-Muster:** Sechs MAV-Fortbildungs-Einträge aus demselben Tag alle mit `MAV/Fortbildung` taggen — beim späteren Tag-Filter bekommst du sechs Treffer zurück und musst dich durch alle lesen, um den DSFA-Eintrag zu finden. Richtig ist: nur `Datenschutz/DSFA` + `Recht/DSGVO`. Der Kontext „Fortbildung" steht ohnehin im Content.

### Drei Schritte

1. **`list_tags` aufrufen** — bei spezifischem Thema mit passendem Prefix (z.B. `prefix="MAV/"`), sonst ohne. Liefert das aktuelle Vokabular mit Häufigkeiten.
2. **Tags generieren** — Mischung aus:
   - **Hierarchischen Tags mit `/`-Trenner** für das Kernthema: `"Datenschutz/DSFA"`, `"MAV/Überlastungsanzeige"`, `"Recht/SGB"`. 1–3 Stück, jeder unterscheidet den Eintrag von thematisch benachbarten.
   - **Losen Stichworten** ohne `/` nur, wenn sie etwas Präzises abdecken, das der Hierarchie fehlt: Eigennamen (`"Karpathy"`, `"Sun Tzu"`), Produktnamen (`"Bialetti"`), konkrete Fälle (`"Fall/Musterfrau"`). 0–3 Stück.
   - **Kontext-Tags** (wie `operative-Anweisung`, `Reflexion/OPJ1`) nur ergänzen, wenn sie zusätzlich zum Inhalts-Tag echten Filterwert haben. Nicht als Hauptträger verwenden.
3. **Retrieval-Test im Kopf durchführen:** „Suche ich in 4 Wochen nach diesem Thema — findet mein Tag-Set den Eintrag eindeutig?" Wenn der Test durchfällt: konkreter werden, nicht mehr Tags dazunehmen.

**Weniger ist besser:** 2–3 präzise Tags schlagen 6–8 generische. Mehr Tags bedeuten: der Eintrag taucht in mehr Filterlisten auf und wird dort zu Rauschen.

**Keine zeitlichen Tags.** Datums-Tags wie `Studientag-2026-03-19` sind Retrieval-Rauschen — das Datum steht im Content und reicht für BM25 aus. Tags beschreiben *was*, nicht *wann*.

**Maximum:** 20 Tags pro Eintrag, jeder Tag bis 100 Zeichen — aber dieses Maximum ist kein Zielwert, sondern eine Obergrenze.

### Beispiele

**Gut — Inhalts-Tag differenziert klar:**
```
content: "Art. 35 DSGVO — Datenschutzfolgenabschätzung ist verpflichtend bei
         Einführung neuer Technologien mit hohem Risiko..."
tags:    ["Datenschutz/DSFA", "Recht/DSGVO", "MAV/Mitbestimmung"]
```
Test: Suche „DSFA" → findet den Eintrag direkt über den Inhalts-Tag.

**Gut — auch bei Produkt-Präferenzen:**
```
content: "Oliver bevorzugt Espresso aus der Bialetti, gemahlen mit der
         Eureka Mignon, mittlere Mahlung. Bohnen aktuell von Hoppenworth
         & Ploch, Sorte 'Brasil Bourbon Vermelho'."
tags:    ["Privat/Kaffee", "Bialetti", "Eureka Mignon"]
```
Test: Suche „Bialetti" oder „Espresso-Mühle" → findet den Eintrag.

**Schlecht — nur Kontext-Tags, kein Inhalts-Tag:**
```
tags: ["MAV/Fortbildung", "operative-Anweisung"]
```
Test: Suche „Sozialgeheimnis" → findet nichts, weil der Inhalt nirgends im Tag-Set benannt ist.

**Schlecht — zu viele generische Tags:**
```
tags: ["Kaffee", "Espresso", "Mahlwerk", "Bohnen", "Präferenz", "Privat", "Oliver"]
```
Test: Suche „Kaffee" → 20 Treffer, alle ungeordnet. Kein Tag diskriminiert.

## Speicher-Workflow (Memories)

1. **Tagging** wie oben.
2. **`add_memory` aufrufen** mit:
   - `content`: der Text. **Bei > 1000 Wörtern überlegen, ob Atomisierung sinnvoll ist.** Volltexte gehören in andere Systeme (z.B. kDrive-Quellen), nicht hier. Im Zweifel speichern und Soft-Warnung des Servers respektieren.
   - `tags`: generierte Liste. Wenn `tags=null`, generiert der Server selbst via Ministral 3 — aber kuratierte Tags sind besser.
   - `author`: Name der eigenen Instanz (`alfred`, `opj1`, `kai`, `pi`, `cowork`, ...). **Niemals leer lassen.** Wenn unklar, Default `alfred` für Claude.ai-Sessions.
   - `visibility`: `["global"]` als Standard. Nur einschränken, wenn Oliver explizit sagt „nur für X sichtbar".
   - `source`: `"mcp"` (Default), oder spezifisch wie `"telegram"`, `"manual"`, `"cron"`.
3. **Auf Similarity-Warning achten.** Wenn der Server zurückmeldet, dass ein ähnlicher Eintrag bereits existiert: nicht stur drüberschreiben, sondern Oliver kurz fragen, ob aktualisieren (`update_memory`) sinnvoller wäre als neu anlegen.

## Such-Workflow (Memories)

1. **Query formulieren**, möglichst konkret. Hybrid-Suche (semantisch + BM25) erkennt sowohl Bedeutung als auch exakte Begriffe (Paragrafen, Eigennamen, Aktenzeichen).
2. **Optional Tag-Filter** mit `tags=[...]`. AND-Verknüpfung. Prefix-Match für Hierarchie: `tags=["MAV/"]` matcht alles unter `MAV/...`.
3. **`agent`-Parameter setzen**, wenn nur Sichtbarkeit für eine bestimmte Instanz gefragt ist. Default leer = alle Einträge. Für Claude.ai-Sessions üblicherweise `agent="alfred"`.
4. **Treffer auswerten und nutzen.** Wenn ein Treffer der Antwort substanziell geholfen hat: **`reinforce_memory(id)` aufrufen.** Das fließt ins Ranking ein und macht das System mit der Zeit besser.

## Dokumenten-Workflow (kDrive-RAG)

Die Dokumenten-Tools (`search_documents_tool`, `list_collections`, `get_full_document`) durchsuchen automatisch indexierte Quellen aus dem kDrive (PDFs, DOCX, Audio-Transkripte). Andere Datenbasis als Memories.

**Wo die Collections herkommen:** Quellen-Dokumente liegen im kDrive unter `/OpenBrain-Inbox/<Subdir>/...` und werden automatisch in eine gleichnamige Collection indexiert (Subordner-Pfad lowercased, mit `/` verbunden). Beispiel: `/OpenBrain-Inbox/Rechtsrecherche/MAV/foo.pdf` → Collection `rechtsrecherche/mav`. Dateien direkt im Inbox-Root landen in `kdrive_inbox`.

**Such-Strategie:**

1. **Bei Unsicherheit zuerst `list_collections`** — zeigt, welche Bestände aktuell existieren (dynamisch, weil neue kDrive-Ordner automatisch neue Collections erzeugen).
2. **`search_documents_tool` ohne `collection`-Filter** als Default — Hybrid-Suche + Reranker filtern semantisch. `collection` nur setzen, wenn nötige Eingrenzung gegen Off-Topic-Bleed sinnvoll ist.
3. **Wenn der Chunk-Ausschnitt nicht reicht: `get_full_document` mit `document_id`** aus dem Suchtreffer. Bei großen Dokumenten via `offset` paginieren (`truncated: true` zeigt an, dass mehr da ist).

**Hinweis:** Metadata-Filter (rechtsgebiet, quellentyp, Datum) werden derzeit nicht unterstützt — gewünschten Filter in den Suchbegriff einbauen oder Treffer im Anschluss filtern.

**Bei juristischen Fragen:** Der Rechtsrecherche-Skill steuert die Verwendung von `search_documents_tool` für MAVO/AVR/KAVO und kombiniert sie mit NeuRIS, EUR-Lex etc. — wenn die Frage rechtlich ist, an den Rechtsrecherche-Skill abgeben.

## Inspektions-Workflow

- **`get_stats`** für einen Überblick (Anzahl Memories, Documents, Chunks, Top-Collections) — gut für „wie viel ist gerade in OpenBrain".
- **`browse_recent`** für chronologische Ansicht der jüngsten Memories — gut für „was hab ich gestern gespeichert".
- **`get_top_memories`** für die meist-verstärkten Einträge — zeigt, was das System als wichtig gelernt hat.
- **`get_stale_memories`** für Einträge, die seit N Monaten (Default 6) nicht abgerufen wurden — Kandidaten für Review oder Löschung. Nur Vorschläge, nicht eigenmächtig löschen.

## Update- und Lösch-Workflow

- **`update_memory`**: `tags` überschreibt komplett (kein Merge). Wenn nur ein Tag ergänzt werden soll, vorher den Eintrag suchen, alte Tags + neuer Tag zusammenbauen, dann `update_memory` mit der vollständigen Liste. Bei `content`-Änderung wird das Embedding neu generiert — kleine Korrekturen rechtfertigen das nicht immer, eine Anmerkung im Content kann reichen.
- **`delete_memory`**: nur auf explizite Anweisung Olivers. Nie eigenmächtig.
- **`delete_document`**: nicht selbst aufrufen — das ist die Aufgabe der kdrive-bridge, die auf kDrive-deleted-Events reagiert. Wenn manuell ein Dokument raus muss, ist es sauberer, es im kDrive zu löschen und die Bridge machen zu lassen.

## Format-Konventionen für Memory-Inhalte

- **Datum-Stempel** bei Beobachtungen, Beschlüssen, Ereignissen sind wertvoll: „Oliver hat am 15.04.2026 entschieden, ..." — macht spätere Zeitbezüge möglich. **Im Content, nicht im Tag.**
- **Quellenhinweis im Fließtext**, nicht als separates Feld: „Laut Substack-Artikel von Limited Edition Jonathan vom 23.03.2026: ...". Es gibt kein `source_url`-Feld in v2 — Quellen kommen, wenn relevant, in den Content selbst.
- **Strukturierte Inhalte** (Listen, Aufzählungen) sind erlaubt, wenn sie das Wiederfinden erleichtern. Keine ausgefeilten Markdown-Layouts — schlichter Text reicht.
- **Mehrere zusammengehörige Punkte aus einer Session** lieber als **mehrere kleine Einträge** speichern als als einen großen. Atomisierung verbessert die Suche.
- **Nur Zusammenfassungen abgeschlossener Vorgänge** speichern, nicht Implementations-Details oder Work-in-Progress. Das System ist Gedächtnis, nicht Logbuch.

## Häufige Fehler

- ❌ **Memory und Documents verwechseln.** `search_memory` findet keine PDF-Inhalte, `search_documents_tool` findet keine Notizen. Wenn unsicher: welche Datenklasse wird gesucht? Eigene Notiz → memory. kDrive-PDF → document.
- ❌ **Filtern statt speichern.** „Brauchst du das wirklich gespeichert?" — die Frage ist abgeschafft. Wenn Oliver es speichern will, speicherst du es.
- ❌ **Tags ohne `list_tags`-Check.** Führt zu Vokabular-Drift („MAV/Mitbestimmung" vs. „MAV/Mitwirkung" vs. „Mitbestimmungsrechte"). Immer erst nachschauen, was es schon gibt.
- ❌ **Auto-Metadaten als Standard-Strategie.** Wenn man `tags=null` lässt, übernimmt Ministral 3 — aber dessen Tags sind nicht so gut wie die von einem LLM, das den Kontext der Konversation kennt. Bewusst eigene Tags setzen.
- ❌ **Nur Kontext-Tags, kein Inhalts-Tag.** Der Eintrag ist dann nicht gezielt auffindbar. `MAV/Fortbildung` oder `Reflexion/OPJ1` ohne eigenen inhaltlichen Tag ist ein Warnzeichen.
- ❌ **Kontext-Tag als Sammelbecken.** Wenn fünf Einträge aus derselben Fortbildung denselben Kontext-Tag bekommen, wird der Tag zum undurchsuchbaren Stapel. Inhalt differenziert, Kontext abstrahiert.
- ❌ **Über-Tagging.** 6+ Tags pro Eintrag = Rauschen in vielen Filterlisten. 2–3 präzise Tags sind fast immer besser als 6 unspezifische.
- ❌ **Zeitliche Tags** (`Studientag-2026-03-19`, `April-2026`). Datum gehört in den Content, nicht ins Tag-Set. Tags beantworten *was*, nicht *wann*.
- ❌ **Nur lose Stichworte, keine Hierarchie.** Hierarchische Tags sind das Rückgrat der Filterung. Lose Stichworte ergänzen sie, ersetzen sie aber nicht.
- ❌ **Riesige Volltexte ohne Atomisierung.** Ein einzelner 5000-Wörter-Eintrag ist ein schlechter Embedding-Vektor — er findet sich nur bei sehr generischen Queries. Lieber 5 thematische Einträge à 500 Wörter.
- ❌ **`reinforce_memory` vergessen, wenn ein Treffer geholfen hat.** Das ist der einzige Mechanismus, mit dem das System lernt, was wichtig ist.
- ❌ **`author` leer lassen.** Macht spätere Auswertungen schwer („wer hat das eigentlich notiert?"). Immer den Namen der eigenen Instanz setzen.
- ❌ **`visibility` einschränken ohne Anweisung.** Default ist `["global"]`. Einschränkungen nur, wenn Oliver es explizit sagt.
- ❌ **Similarity-Warning ignorieren.** Wenn der Server beim `add_memory` einen sehr ähnlichen Eintrag meldet, kurz prüfen — meistens ist ein `update_memory` auf den existierenden Eintrag sauberer als ein neuer.
- ❌ **`delete_document` eigenmächtig aufrufen.** Das ist die Aufgabe der kdrive-bridge. Direkt-Aufruf umgeht den normalen Lifecycle.
- ❌ **`memory_type` setzen.** Das Feld gibt es in v2 nicht mehr.
- ❌ **Hartcodierte Collection ohne Grund** beim Dokumenten-Suchen. Collections entstehen automatisch aus kDrive-Ordnern — wer eine feste Collection setzt, übersieht neue Quellen aus anderen Ordnern. Default ohne `collection`; Filter nur bei spürbarem Off-Topic-Bleed.

## Abgrenzung zu anderen Skills

| System | Konnektor | Wofür |
|--------|-----------|-------|
| **OpenBrain – Memories** (dieser Skill, Memory-Tools) | `openbrain-oliver.kozow.com` | Persistente Notizen, Erkenntnisse, Präferenzen, Ereignisse, Beobachtungen, beliebige Inhalte |
| **OpenBrain – Documents** (dieser Skill, Document-Tools) | `openbrain-oliver.kozow.com` | kDrive-RAG: PDFs, DOCX, Audio-Transkripte. Automatisch indexiert |
| **Rechtsrecherche** (eigener Skill) | `rechtsrecherche.og-monschau.de` | Juristische Quellenrecherche: Gesetze, Urteile, Paragrafen, Kommentare, Aktenzeichen. Nutzt OpenBrain-Documents für kirchenrechtliche Quellen mit |

**Faustregel:** Geht es um etwas, das später wieder aufrufbar sein soll, ist OpenBrain die Default-Wahl. Geht es um eine konkrete juristische Frage mit Gesetzes-/Urteils-Bezug, übernimmt der Rechtsrecherche-Skill die Steuerung (und ruft seinerseits OpenBrain-Tools auf).
