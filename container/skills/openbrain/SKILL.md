---
name: openbrain
description: "Olivers persönliches KI-Gedächtnis und Dokumenten-RAG. Nutze IMMER, wenn etwas in OpenBrain gespeichert, gesucht, aktualisiert, verstärkt oder gelöscht werden soll, oder bei Begriffen wie 'OpenBrain', 'merk dir', 'speicher das', 'ins Gedächtnis', 'notier dir', 'erinner dich an', 'was weißt du über', 'such in OpenBrain', 'verstärke', 'reinforce'. Auch bei 'Was haben wir zu X besprochen?', 'Hast du Erinnerungen an...', 'Schreib das in dein Gedächtnis', oder wenn andere Agents (OPJ1, Claude Code, Cowork) etwas dauerhaft festhalten wollen. Triggert beim Speichern beliebiger Inhalte — Notizen, Rezepte, Artikel, Reflexionen, technische Erkenntnisse, Beobachtungen. Triggert auch bei Such-Anfragen in eigenen Dokumenten ('such in meinen PDFs', 'was steht in [Dokument]', 'durchsuche meine Quellen'), außer bei juristischer Paragrafenrecherche (→ Rechtsrecherche-Skill). NICHT bei: juristischer Paragrafenrecherche, reiner Konversation ohne Speicher- oder Suchabsicht."
---

# OpenBrain — Persistentes KI-Gedächtnis und Dokumenten-RAG

OpenBrain ist Olivers selbst gehostetes Memory- und RAG-System. Es läuft als FastMCP-Server auf seinem Hetzner-VPS unter `openbrain-oliver.kozow.com`. Speicher: PostgreSQL mit pgvector (semantisch), pg_search (BM25), RRF-Fusion, bge-reranker-v2-m3 (zweite Stufe).

Zwei Datenklassen, **eine** Infrastruktur:

- **Memories** — kuratierte Einträge (Notizen, Erkenntnisse, Präferenzen, Beobachtungen). Werden von Agents geschrieben.
- **Documents** — automatisch indexierte Quellen aus **Paperless-ngx** (PDFs, DOCX, Scans, Audio-Transkripte). Werden über den `paperless-embedder` zugespielt.

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
- „such in meinen Dokumenten/PDFs", „was steht in [Dokument]", „in meinen Quellen suchen" → Dokumenten-Tools
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
| `search_memory` | Hybrid-Suche mit Reranking. Trailing `/` im Tag = Prefix-Match. `full_content=False` liefert pro Treffer nur eine ~300-Zeichen-Vorschau (spart Kontext-Tokens). | `query` (Pflicht), `agent`, `tags` (AND-Filter), `limit`, `offset`, `full_content` |
| `get_memory` | Volltext + Metadaten eines einzelnen Eintrags per ID. Gegenstück zur Vorschau-Suche; kein Embedding-Call. | `memory_id` (Pflicht) |
| `update_memory` | Partial-Update. Bei `content`-Änderung wird das Embedding neu generiert. | `id` (Pflicht), `content`, `tags`, `author`, `visibility` |
| `reinforce_memory` | hit_count um 1 erhöhen — Verstärkungs-Signal für das Ranking. | `id` (Pflicht) |
| `delete_memory` | Eintrag löschen. **Nur auf explizite Anweisung Olivers.** | `id` (Pflicht) |

**Token-sparsam suchen (Default-Vorgehen):** `search_memory` mit `full_content=False` aufrufen — das liefert pro Treffer nur eine ~300-Zeichen-Vorschau. Erst wenn ein Treffer wirklich relevant ist, seinen Volltext gezielt mit `get_memory(memory_id)` nachladen (Index → Detail, wie bei Dokumenten `search_documents_tool` → `get_full_document`). Grund: Einzelne Memories können sehr lang sein (bis >20.000 Zeichen); mehrere Volltexte auf einmal sprengen sonst den Arbeitskontext und lösen Compaction-Thrashing aus. Nur wenn du den Volltext der Treffer ohnehin sofort komplett brauchst, ist `full_content=True` (Default) sinnvoll.

### Document-Tools (Paperless-RAG)

| Tool | Zweck | Wichtige Parameter |
|------|-------|---------------------|
| `search_documents_tool` | Hybrid-Suche in Quellen-Chunks (PDFs, DOCX, Scans, Audio-Transkripte aus Paperless). Liefert pro Treffer Volltext-Chunk (~1000 Zeichen), Seitenzahl, `document_id`, `collection`, `rrf_score`. Ohne `collection`-Filter: über alle Collections. | `query` (Pflicht), `collection`, `limit` |
| `list_collections` | Alle aktuell genutzten Collection-Namen mit Count. Collections entstehen automatisch aus Paperless-Tags (`collection:<name>`) bzw. Dokumenttypen; Default `paperless_inbox`. | keine |
| `get_full_document` | Vollständiger Text eines Dokuments (chunk_index 0..N konkateniert). Bei > 50 Chunks wird `truncated: true` gesetzt — via `offset` weiterblättern. | `document_id` (Pflicht), `limit`, `offset` |
| `rag_search` | v1-kompatibler Alias auf `search_documents_tool` mit Collection-Mapping `collection_a` → `rechtsrecherche/mav`, `collection_b` → `rechtsrecherche/sozialrecht`. | `query` (Pflicht), `collection`, `top_k` |
| `delete_document` | Quell-Dokument + alle zugehörigen Chunks löschen (CASCADE). **Destruktiv — nur auf Olivers Anweisung; der `paperless-embedder` räumt nicht selbst auf.** Im Parameter `kdrive_path` steht der OpenBrain-Pfad, heute i.d.R. `paperless:/{id}`. | `kdrive_path` (Pflicht) |

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

### Grundprinzip: Tags adressieren, sie entdecken nicht

Gefunden wird in OpenBrain über den *Inhalt* (semantisch + BM25 + Reranker) — dafür braucht es keine Tags, eine natürlichsprachige Query genügt. Der Tag-Filter ist ein **sekundäres** Werkzeug für den gezielten Zugriff, wenn die Adresse schon bekannt ist.

**Tags sind unabhängige, atomare Etiketten** — beim *Schreiben* keine neuen Hierarchien anlegen. Beim *Filtern* kann die Engine aber zweierlei: `tags=["MAV"]` (ohne Slash) matcht **exakt** (nur das blanke Tag `MAV`); `tags=["MAV/"]` (mit Trailing-Slash) matcht als **Präfix** alle `MAV/…`-Tags. Die flache Schreib-Konvention (seit 2026-06-14) ist eine Schreib-Disziplin und hebt diese Filter-Fähigkeit **nicht** auf — bestehende `X/Y`-Tags bleiben über Trailing-Slash gebündelt abrufbar.

### Was getaggt wird (wenig, gezielt — 1–3 Stück)

- **Klasse/Status** — wofür man später einen *Stapel* anfasst oder was man in einer Trefferliste auf einen Blick erkennen will: `Maintenance/Report`, `Lessons-Learned`, `operative-Anweisung`, `Pre-Read/wichtig`, `erledigt`, `offen`, Batch-Stempel wie `Auto-Memory/Migration-2026-05-21`.
- **Stabile Adresse benannter Artefakte**, die exakt wieder abgerufen werden: `OpenBrain/Anleitung`. (Das ist eine Adresse, kein Thema.)

### Was NICHT getaggt wird

- **Feine Themen** — `Philosophie/Laozi`, `MAV/Eingruppierung`. Das Thema steht im Content und wird über die Inhaltssuche gefunden. Als Filter ist ein Themen-Tag Dekoration, als Lese-Etikett redundant.
- **Datums-Themen** — ein Datum gehört in den Content. (Bewusst gesetzte Batch-/Migrations-Stempel für Stapel-Operationen sind die Ausnahme — die sind Klasse, nicht „wann".)

### Drei Schritte

1. **`list_tags` aufrufen** — gegen Schreibweisen-Doubletten, nicht um eine Hierarchie zu pflegen. Liefert das aktuelle Vokabular mit Häufigkeiten.
2. **1–3 Tags wählen** — Klasse/Status + ggf. stabile Adresse. Bestehende Schreibweise übernehmen, nicht neu erfinden.
3. **Speichern.** Im Zweifel weniger taggen — der Inhalt trägt die Suche.

**Einzige verbleibende Hygiene:** gleiche Schreibweise. `nanobot`, nicht `Nanobot`; eine Form, nicht drei.

**Keine zeitlichen Tags** (außer bewusste Batch-Stempel). Datums-Tags wie `Studientag-2026-03-19` sind Retrieval-Rauschen — das Datum steht im Content.

**Maximum:** 20 Tags pro Eintrag, jeder Tag bis 100 Zeichen — eine Obergrenze, kein Zielwert.

**Bestand bleibt:** existierende `X/Y`-Tags werden als atomare Etiketten weiterbenutzt. Keine Migration, kein Zerlegen.

### Beispiele

**Gut — Klasse/Status für einen späteren Stapel:**
```
content: "OpenBrain-Maintenance-Report — KW 24, 2026 …"
tags:    ["Maintenance/Report", "KW-24-2026"]
```
Beide sind Klasse/Stempel — man greift alle Reports bzw. die einer Woche als Stapel.

**Gut — stabile Adresse eines benannten Artefakts:**
```
content: "OPENBRAIN AGENT-ANLEITUNG …"
tags:    ["OpenBrain/Anleitung", "operative-Anweisung"]
```
`OpenBrain/Anleitung` ist eine Adresse, die exakt abgerufen wird (Session-Start-Lookup).

**Gut — Lesson, sparsam getaggt:**
```
content: "Bei sportstatistischen Daten nie aus dem Gedächtnis zitieren …"
tags:    ["Lessons-Learned", "Fehler/nicht-wiederholen"]
```
Das Thema (Boxen, Foreman) steht im Content — kein `boxing`-Tag nötig.

**Schlecht — feines Thema als Tag:**
```
tags: ["Philosophie/Laozi", "Daodejing/Kapitel-8", "Wasser-Metapher"]
```
Die Suche „Laozi Wasser" findet den Eintrag über den Content. Die Themen-Tags sind Dekoration und blähen die Filterlisten auf.

## Speicher-Workflow (Memories)

1. **Tagging** wie oben.
2. **`add_memory` aufrufen** mit:
   - `content`: der Text. **Bei > 1000 Wörtern überlegen, ob Atomisierung sinnvoll ist.** Volltexte gehören in andere Systeme (z.B. Paperless-Dokumente), nicht hier. Im Zweifel speichern und Soft-Warnung des Servers respektieren.
   - `tags`: generierte Liste. Wenn `tags=null`, generiert der Server selbst via Ministral 3 — aber kuratierte Tags sind besser.
   - `author`: Name der eigenen Instanz (`alfred`, `opj1`, `kai`, `pi`, `cowork`, ...). **Niemals leer lassen.** Wenn unklar, Default `alfred` für Claude.ai-Sessions.
   - `visibility`: `["global"]` als Standard. Nur einschränken, wenn Oliver explizit sagt „nur für X sichtbar".
   - `source`: `"mcp"` (Default), oder spezifisch wie `"telegram"`, `"manual"`, `"cron"`.
3. **Auf Similarity-Warning achten.** Wenn der Server zurückmeldet, dass ein ähnlicher Eintrag bereits existiert: nicht stur drüberschreiben, sondern Oliver kurz fragen, ob aktualisieren (`update_memory`) sinnvoller wäre als neu anlegen.

## Such-Workflow (Memories)

1. **Query formulieren**, möglichst konkret. Hybrid-Suche (semantisch + BM25) erkennt sowohl Bedeutung als auch exakte Begriffe (Paragrafen, Eigennamen, Aktenzeichen).
2. **Optional Tag-Filter** mit `tags=[...]`. Ohne Slash **exakt** (`tags=["MAV"]` → nur das Tag `MAV`), mit Trailing-Slash **Präfix** (`tags=["MAV/"]` → alle `MAV/…`). AND-Verknüpfung bei mehreren Tags.
3. **`agent`-Parameter setzen**, wenn nur Sichtbarkeit für eine bestimmte Instanz gefragt ist. Default leer = alle Einträge. Für Claude.ai-Sessions üblicherweise `agent="alfred"`.
4. **Treffer auswerten und nutzen.** Wenn ein Treffer der Antwort substanziell geholfen hat: **`reinforce_memory(id)` aufrufen.** Das fließt ins Ranking ein und macht das System mit der Zeit besser.

## Dokumenten-Workflow (Paperless-RAG)

Die Dokumenten-Tools (`search_documents_tool`, `list_collections`, `get_full_document`) durchsuchen automatisch indexierte Quellen aus **Paperless-ngx** (PDFs, DOCX, Scans, Audio-Transkripte). Andere Datenbasis als Memories.

**Wie Dokumente reinkommen — du bringst sie NICHT selbst ein.** Dokumente landen in Paperless (auf dem NAS): entweder Oliver lädt/scannt sie in die **Paperless-Inbox**, oder sie kommen über den **DeltaChat-Archiv-Bot** (Sprach-/Textnotizen → Paperless). Von dort macht der NAS-Auto-OCR den Text, und der `paperless-embedder` (Poll ~60 s) bettet sie in OpenBrain ein (Pfad-Schema `paperless:/{id}`). Atomare Notizen gehören dagegen in den Memory-Store (`add_memory`).

**Wo die Collections herkommen:** aus Paperless — ein Paperless-Tag `collection:<name>` bestimmt die Collection, sonst der Paperless-Dokumenttyp (lowercased), sonst der Default `paperless_inbox`. Beispiele aus dem Bestand: `rechtsrecherche/mav`, `rechtsrecherche/sozialrecht`, `ki`, `diag mav`. (Alt-Collections aus der kDrive-Zeit wie `kdrive_inbox` bleiben als Namen im Bestand; neue Dokumente werden nach obiger Regel einsortiert.)

**Such-Strategie:**

1. **Bei Unsicherheit zuerst `list_collections`** — zeigt, welche Bestände aktuell existieren (dynamisch, weil neue Paperless-Tags/Dokumenttypen neue Collections erzeugen).
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
- **`delete_document`**: entfernt ein Dokument + seine Chunks aus OpenBrain (Parameter `kdrive_path` — dort gehört der OpenBrain-Pfad rein, heute i.d.R. `paperless:/{id}`). Der `paperless-embedder` bettet nur ein und räumt **nicht** auf: Ein in Paperless gelöschtes Dokument verschwindet **nicht** automatisch aus OpenBrain. Nur auf explizite Anweisung Olivers löschen, nie eigenmächtig.

## Format-Konventionen für Memory-Inhalte

- **Datum-Stempel** bei Beobachtungen, Beschlüssen, Ereignissen sind wertvoll: „Oliver hat am 15.04.2026 entschieden, ..." — macht spätere Zeitbezüge möglich. **Im Content, nicht im Tag.**
- **Quellenhinweis im Fließtext**, nicht als separates Feld: „Laut Substack-Artikel von Limited Edition Jonathan vom 23.03.2026: ...". Es gibt kein `source_url`-Feld in v2 — Quellen kommen, wenn relevant, in den Content selbst.
- **Strukturierte Inhalte** (Listen, Aufzählungen) sind erlaubt, wenn sie das Wiederfinden erleichtern. Keine ausgefeilten Markdown-Layouts — schlichter Text reicht.
- **Mehrere zusammengehörige Punkte aus einer Session** lieber als **mehrere kleine Einträge** speichern als als einen großen. Atomisierung verbessert die Suche.
- **Nur Zusammenfassungen abgeschlossener Vorgänge** speichern, nicht Implementations-Details oder Work-in-Progress. Das System ist Gedächtnis, nicht Logbuch.

## Häufige Fehler

- ❌ **Memory und Documents verwechseln.** `search_memory` findet keine PDF-Inhalte, `search_documents_tool` findet keine Notizen. Wenn unsicher: welche Datenklasse wird gesucht? Eigene Notiz → memory. Paperless-Dokument → document.
- ❌ **Filtern statt speichern.** „Brauchst du das wirklich gespeichert?" — die Frage ist abgeschafft. Wenn Oliver es speichern will, speicherst du es.
- ❌ **Tags ohne `list_tags`-Check.** Führt zu Vokabular-Drift („MAV/Mitbestimmung" vs. „MAV/Mitwirkung" vs. „Mitbestimmungsrechte"). Immer erst nachschauen, was es schon gibt.
- ❌ **Auto-Metadaten als Standard-Strategie.** Wenn man `tags=null` lässt, übernimmt Ministral 3 — aber dessen Tags sind nicht so gut wie die von einem LLM, das den Kontext der Konversation kennt. Bewusst eigene Tags setzen.
- ❌ **Feines Thema als Tag.** `Philosophie/Laozi`, `MAV/Eingruppierung` als Filter sind Dekoration — das Thema steht im Content und wird über die Inhaltssuche gefunden.
- ❌ **Über-Tagging.** 6+ Tags pro Eintrag = Rauschen in vielen Filterlisten. 1–3 gezielte Tags (Klasse/Status + ggf. Adresse) sind fast immer besser.
- ❌ **Zeitliche Tags** (`Studientag-2026-03-19`, `April-2026`). Datum gehört in den Content, nicht ins Tag-Set. (Ausnahme: bewusste Batch-/Migrations-Stempel.)
- ❌ **Beim Schreiben neue Hierarchien anlegen.** Flach taggen (Klasse/Status + stabile Adresse) — das ist eine Schreib-Disziplin. Beim *Filtern* dagegen kann die Engine Präfix-Match via Trailing-Slash (`tags=["MAV/"]` bündelt alle `MAV/…`); bestehende `X/Y`-Tags sind so weiterhin gebündelt abrufbar.
- ❌ **Riesige Volltexte ohne Atomisierung.** Ein einzelner 5000-Wörter-Eintrag ist ein schlechter Embedding-Vektor — er findet sich nur bei sehr generischen Queries. Lieber 5 thematische Einträge à 500 Wörter.
- ❌ **`reinforce_memory` vergessen, wenn ein Treffer geholfen hat.** Das ist der einzige Mechanismus, mit dem das System lernt, was wichtig ist.
- ❌ **`author` leer lassen.** Macht spätere Auswertungen schwer („wer hat das eigentlich notiert?"). Immer den Namen der eigenen Instanz setzen.
- ❌ **`visibility` einschränken ohne Anweisung.** Default ist `["global"]`. Einschränkungen nur, wenn Oliver es explizit sagt.
- ❌ **Similarity-Warning ignorieren.** Wenn der Server beim `add_memory` einen sehr ähnlichen Eintrag meldet, kurz prüfen — meistens ist ein `update_memory` auf den existierenden Eintrag sauberer als ein neuer.
- ❌ **`delete_document` eigenmächtig aufrufen.** Dokumente kommen über Paperless rein; ein Dokument aus OpenBrain zu entfernen ist destruktiv — nur auf Olivers ausdrückliche Anweisung.
- ❌ **`memory_type` setzen.** Das Feld gibt es in v2 nicht mehr.
- ❌ **Hartcodierte Collection ohne Grund** beim Dokumenten-Suchen. Collections entstehen automatisch aus Paperless-Tags/Dokumenttypen — wer eine feste Collection setzt, übersieht neue Quellen. Default ohne `collection`; Filter nur bei spürbarem Off-Topic-Bleed.

## Abgrenzung zu anderen Skills

| System | Konnektor | Wofür |
|--------|-----------|-------|
| **OpenBrain – Memories** (dieser Skill, Memory-Tools) | `openbrain-oliver.kozow.com` | Persistente Notizen, Erkenntnisse, Präferenzen, Ereignisse, Beobachtungen, beliebige Inhalte |
| **OpenBrain – Documents** (dieser Skill, Document-Tools) | `openbrain-oliver.kozow.com` | Paperless-RAG: PDFs, DOCX, Scans, Audio-Transkripte. Automatisch über Paperless indexiert |
| **Rechtsrecherche** (eigener Skill) | `rechtsrecherche.og-monschau.de` | Juristische Quellenrecherche: Gesetze, Urteile, Paragrafen, Kommentare, Aktenzeichen. Nutzt OpenBrain-Documents für kirchenrechtliche Quellen mit |

**Faustregel:** Geht es um etwas, das später wieder aufrufbar sein soll, ist OpenBrain die Default-Wahl. Geht es um eine konkrete juristische Frage mit Gesetzes-/Urteils-Bezug, übernimmt der Rechtsrecherche-Skill die Steuerung (und ruft seinerseits OpenBrain-Tools auf).
