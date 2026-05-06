---
name: openbrain
description: "Olivers persönliches KI-Gedächtnis (PostgreSQL + pgvector + BM25 + Reranker). Nutze IMMER, wenn etwas in OpenBrain gespeichert, gesucht, aktualisiert, verstärkt oder gelöscht werden soll, oder bei Begriffen wie 'OpenBrain', 'merk dir', 'speicher das', 'ins Gedächtnis', 'notier dir', 'erinner dich an', 'was weißt du über', 'such in OpenBrain', 'verstärke', 'reinforce'. Auch bei 'Was haben wir zu X besprochen?', 'Hast du Erinnerungen an...', 'Schreib das in dein Gedächtnis', oder wenn andere Agents (OPJ1, Claude Code, Cowork) etwas dauerhaft festhalten wollen. Triggert beim Speichern beliebiger Inhalte — MAV-Notizen, Rezepte, Studien, Artikel, Reflexionen, technische Erkenntnisse, Beobachtungen. Auch bei Wartungs-Anfragen: 'Statistik', 'Bericht', 'Übersicht', 'Aufräumen', 'Duplikate prüfen', 'stale Einträge', 'Top-Memories', 'Wartung'. NICHT bei: juristischer Paragrafenrecherche (→ Rechtsrecherche), reiner Konversation ohne Speicher- oder Suchabsicht."
---

# OpenBrain — Persistentes KI-Gedächtnis

OpenBrain ist Olivers selbst gehostetes Gedächtnis-System. Es läuft als FastMCP-Server auf seinem Hetzner-VPS unter `openbrain-oliver.kozow.com`. Speicher: PostgreSQL mit pgvector (semantisch), pg_search (BM25), RRF-Fusion, bge-reranker-v2-m3 (zweite Stufe). Es ist das **eine** persistente Memory-System für alle Agents — Alfred (Claude.ai), OPJ1/NanoClaw (Telegram), Claude Code und Cowork.

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
- jede Aussage Olivers, die wie eine festzuhaltende Erkenntnis, Präferenz, Beobachtung oder ein Ereignis klingt — auch ohne explizite Speicheranweisung, wenn der Inhalt erkennbar Wert für künftige Konversationen hat

**Triggert NICHT bei:**

- juristischen Quellen mit Paragraf, Aktenzeichen, Gerichtsurteil → Rechtsrecherche-Skill
- reiner Konversation ohne Speicher- oder Suchabsicht

## MCP-Werkzeuge

| Tool | Zweck | Wichtige Parameter |
|------|-------|---------------------|
| `add_memory` | Neuer Eintrag | `content` (Pflicht), `tags` (siehe Tagging-Protokoll), `author`, `visibility`, `source` |
| `search_memory` | Hybrid-Suche mit Reranking | `query` (Pflicht), `agent` (Sichtbarkeitsfilter), `tags` (AND-Filter), `limit` |
| `update_memory` | Eintrag ändern | `id` (Pflicht), `content`, `tags`, `author`, `visibility` |
| `reinforce_memory` | hit_count um 1 erhöhen | `id` (Pflicht) |
| `delete_memory` | Eintrag löschen | `id` (Pflicht) |
| `list_tags` | Tag-Vokabular abrufen | `prefix` (optional), `limit` |

### Wartungs-Tools

Zusätzlich zum Kerngeschäft (oben) bietet der Server sieben Wartungs-Tools, die nur bei expliziter Statistik-/Aufräum-Anfrage oder beim wöchentlichen Wartungs-Task triggern:

| Tool | Zweck | Wichtige Parameter |
|------|-------|---------------------|
| `browse_recent` | Zuletzt hinzugefügte Einträge in zeitlicher Reihenfolge | `limit`, `offset` |
| `get_stats` | Server-weite Statistiken (Anzahl, Tag-Verteilung, Aktivität) | — |
| `get_top_memories` | Meistgenutzte Einträge nach `hit_count` | `limit` |
| `get_stale_memories` | Alte, ungenutzte Einträge (Lösch-Kandidaten) | `limit`, `min_age_days` |
| `get_review_candidates` | Einträge, die ein Review brauchen | `limit` |
| `get_similar_memories` | Duplikat-Suche zu einem konkreten Eintrag | `id`, `limit`, `threshold` |
| `delete_memories` | Bulk-Löschung mehrerer Einträge | `ids[]` |

**Trigger-Begriffe:** „Statistik", „Bericht", „Übersicht", „Duplikate prüfen", „Aufräumen", „stale Einträge", „Top-Memories", „Wartung". Außerhalb dieser Trigger nicht aufrufen — die Tools machen den normalen Such- und Speicher-Fluss träger.

**Nie eigenmächtig löschen.** Auch `delete_memories` folgt der `delete_memory`-Regel: nur auf explizite Anweisung Olivers. Der wöchentliche Wartungs-Task (Sonntag 19:00, scheduled task `task-1777530798342-smthgv`) identifiziert Kandidaten und legt sie zur Bestätigung vor — er führt selbst keine Löschungen oder Merges aus.

## Tagging-Protokoll vor jedem `add_memory`

Tags werden vom aufrufenden LLM **vor** dem Speichern generiert. Ohne Tags ist ein Eintrag schwer wieder auffindbar.

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

## Speicher-Workflow

1. **Tagging** wie oben.
2. **`add_memory` aufrufen** mit:
   - `content`: der Text. **Bei > 1000 Wörtern überlegen, ob Atomisierung sinnvoll ist.** Volltexte gehören in NotebookLM-OSS, nicht hier. Im Zweifel speichern und Soft-Warnung des Servers respektieren.
   - `tags`: generierte Liste.
   - `author`: Name der eigenen Instanz (`alfred`, `opj1`, `kai`, `pi`, `cowork`, ...). **Niemals leer lassen.** Wenn unklar, Default `alfred` für Claude.ai-Sessions.
   - `visibility`: `["global"]` als Standard. Nur einschränken, wenn Oliver explizit sagt „nur für X sichtbar".
   - `source`: `"mcp"` (Default), oder spezifisch wie `"telegram"`, `"manual"`, `"cron"`.

## Such-Workflow

1. **Query formulieren**, möglichst konkret. Hybrid-Suche (semantisch + BM25) erkennt sowohl Bedeutung als auch exakte Begriffe (Paragrafen, Eigennamen, Aktenzeichen).
2. **Optional Tag-Filter** mit `tags=[...]`. AND-Verknüpfung. Prefix-Match für Hierarchie: `tags=["MAV/"]` matcht alles unter `MAV/...`.
3. **`agent`-Parameter setzen**, wenn nur Sichtbarkeit für eine bestimmte Instanz gefragt ist. Default leer = alle Einträge.
4. **Treffer auswerten und nutzen.** Wenn ein Treffer der Antwort substanziell geholfen hat: **`reinforce_memory(id)` aufrufen.** Das fließt ins Ranking ein und macht das System mit der Zeit besser.

## Update- und Lösch-Workflow

- **`update_memory`**: `tags` überschreibt komplett (kein Merge). Wenn nur ein Tag ergänzt werden soll, vorher den Eintrag suchen, alte Tags + neuer Tag zusammenbauen, dann `update_memory` mit der vollständigen Liste.
- **`delete_memory`**: nur auf explizite Anweisung Olivers. Nie eigenmächtig.
- **`delete_memories`** (Bulk): identische Regel wie `delete_memory`. Nie eigenmächtig.

## Format-Konventionen für Inhalte

- **Datum-Stempel** bei Beobachtungen, Beschlüssen, Ereignissen sind wertvoll: „Oliver hat am 15.04.2026 entschieden, ..." — macht spätere Zeitbezüge möglich. **Im Content, nicht im Tag.**
- **Quellenhinweis im Fließtext**, nicht als separates Feld: „Laut Substack-Artikel von Limited Edition Jonathan vom 23.03.2026: ...". Es gibt kein `source_url`-Feld in v2 — Quellen kommen, wenn relevant, in den Content selbst.
- **Strukturierte Inhalte** (Listen, Aufzählungen) sind erlaubt, wenn sie das Wiederfinden erleichtern. Keine ausgefeilten Markdown-Layouts — schlichter Text reicht.
- **Mehrere zusammengehörige Punkte aus einer Session** lieber als **mehrere kleine Einträge** speichern als als einen großen. Atomisierung verbessert die Suche.

## Häufige Fehler

- ❌ **Filtern statt speichern.** „Brauchst du das wirklich gespeichert?" — die Frage ist abgeschafft. Wenn Oliver es speichern will, speicherst du es.
- ❌ **Tags ohne `list_tags`-Check.** Führt zu Vokabular-Drift („MAV/Mitbestimmung" vs. „MAV/Mitwirkung" vs. „Mitbestimmungsrechte"). Immer erst nachschauen, was es schon gibt.
- ❌ **Nur Kontext-Tags, kein Inhalts-Tag.** Der Eintrag ist dann nicht gezielt auffindbar. `MAV/Fortbildung` oder `Reflexion/OPJ1` ohne eigenen inhaltlichen Tag ist ein Warnzeichen.
- ❌ **Kontext-Tag als Sammelbecken.** Wenn fünf Einträge aus derselben Fortbildung denselben Kontext-Tag bekommen, wird der Tag zum undurchsuchbaren Stapel. Inhalt differenziert, Kontext abstrahiert.
- ❌ **Über-Tagging.** 6+ Tags pro Eintrag = Rauschen in vielen Filterlisten. 2–3 präzise Tags sind fast immer besser als 6 unspezifische.
- ❌ **Zeitliche Tags** (`Studientag-2026-03-19`, `April-2026`). Datum gehört in den Content, nicht ins Tag-Set. Tags beantworten *was*, nicht *wann*.
- ❌ **Nur lose Stichworte, keine Hierarchie.** Hierarchische Tags sind das Rückgrat der Filterung. Lose Stichworte ergänzen sie, ersetzen sie aber nicht.
- ❌ **Riesige Volltexte ohne Atomisierung.** Ein einzelner 5000-Wörter-Eintrag ist ein schlechter Embedding-Vektor — er findet sich nur bei sehr generischen Queries. Lieber 5 thematische Einträge à 500 Wörter.
- ❌ **`reinforce_memory` vergessen, wenn ein Treffer geholfen hat.** Das ist der einzige Mechanismus, mit dem das System lernt, was wichtig ist.
- ❌ **`author` leer lassen.** Macht spätere Auswertungen schwer („wer hat das eigentlich notiert?"). Immer den Namen der eigenen Instanz setzen.
- ❌ **`visibility` einschränken ohne Anweisung.** Default ist `["global"]`. Einschränkungen nur, wenn Oliver es explizit sagt.
- ❌ **`memory_type` setzen.** Das Feld gibt es in v2 nicht mehr.

## Abgrenzung zu anderen Skills

| System | Konnektor | Wofür |
|--------|-----------|-------|
| **OpenBrain** (dieser Skill) | `openbrain-oliver.kozow.com` | Alles, was als Memory persistent werden soll: Notizen, Erkenntnisse, Präferenzen, Ereignisse, Beobachtungen, beliebige Inhalte |
| **Rechtsrecherche** (eigener Skill) | `rechtsrecherche-oliver.kozow.com` | Juristische Quellenrecherche: Gesetze, Urteile, Paragrafen, Kommentare, Aktenzeichen |

Für persistente Memories ist OpenBrain die **Default-Wahl**.
