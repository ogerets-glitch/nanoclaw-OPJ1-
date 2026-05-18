---
name: statistik
description: >
  Amtliche deutsche Statistikdaten abrufen und auswerten: BA-Statistik, GENESIS-Online,
  Regionalstatistik, Dashboard Deutschland. Tools laufen im Arbeitsmarkt-MCP-Connector.
  Nutze diesen Skill IMMER bei Fragen nach Zahlen, Statistiken, Kennzahlen, Trends zu:
  Arbeitsmarkt, Arbeitslosigkeit, Fachkräftemangel, Beschäftigung, Migration, Ausländer,
  Zuwanderung, Löhne, Gehälter, Wohnungsmarkt, Mieten, Krankenstand, psychische Gesundheit,
  SGB-II, Bürgergeld, Engpassberufe, regionale Daten Aachen/NRW. Auch bei "Wie viele...",
  "Gibt es Daten zu...", "aktuelle Zahlen", "Entwicklung von...", "Trend bei...".
  Bei MAV-Arbeit (Lohnentwicklung, Krankenstand, Gefährdungsbeurteilung) und
  Migrationsberatung (Zuzugszahlen, Arbeitsmarktintegration, SGB-II-Quoten).
  NICHT bei: Rechtsfragen (→ Rechtsrecherche), Stellensuche (→ direkt jobsuche_search),
  oder wenn keine amtlichen Daten nötig.
---

# Statistik-Recherche

Schwerpunktthemen: **Migration, Arbeitsmarkt & Fachkräftemangel, Wohnungsmarkt, Krankheit & psychische Gesundheit, Löhne & Inflation.**

## Verfügbare Tools (16 funktionierend, 2 eingeschränkt)

### BA-Statistik — monatsaktuelle Arbeitsmarktdaten auf Kreisebene

Die wichtigste Quelle für den täglichen Bedarf in Migrationsberatung und MAV-Arbeit. Seit Dezember 2025 verfügbar, keine Authentifizierung nötig.

| Tool | Funktion | Typische Frage |
|------|----------|----------------|
| `ba_arbeitsmarkt` | Arbeitslosigkeit, Unterbeschäftigung, offene Stellen (Bund/Land/Kreis, Zeitreihe) | "Wie ist die aktuelle Arbeitsmarktlage in Aachen?" |
| `ba_beschaeftigung` | SV-pflichtig Beschäftigte nach Wirtschaftszweig, Region, Nationalität | "Wie entwickelt sich die Beschäftigung im Sozialwesen?" |
| `ba_grundsicherung` | SGB-II-Empfänger, Bedarfsgemeinschaften, Hilfequote auf Kreisebene | "Wie viele Bürgergeld-Empfänger gibt es in der StädteRegion Aachen?" |
| ⚠️ `ba_migration` | **Stub** — Verweist auf GENESIS-Tabellen 12521/12711 als Alternative | Arbeitsmarktintegration Geflüchteter → GENESIS nutzen |
| ⚠️ `ba_entgelt` | **OAuth 403** — BA hat Credentials geändert, aktuell nicht funktionsfähig | Median-Verdienste → GENESIS 62321 oder Web-Suche als Fallback |

⚠️-Tools sind bekannt defekt. Nicht aufrufen, sondern die genannten Alternativen verwenden.

### GENESIS-Online — tiefe historische Daten (Destatis)

Breites Themenspektrum, lange Zeitreihen, 6–18 Monate Zeitverzug. Authentifizierung serverseitig konfiguriert.

| Tool | Funktion | Typische Frage |
|------|----------|----------------|
| `genesis_search` | Volltextsuche nach Statistiken und Tabellen | "Welche Tabellen gibt es zum Thema Wanderung?" |
| `genesis_metadata` | Metadaten: verfügbare Merkmale, Zeiträume, Codes | Vor dem Tabellenabruf — verstehen, was in einer Tabelle steckt |
| `genesis_table` | Datentabelle im Flat-File-Format abrufen (filterbar) | Konkrete Zahlen holen, wenn Tabellencode bekannt |

Hinweis: Die GENESIS-Suchmaschine ist Lucene-basiert und empfindlich. Bei schlechten Treffern: kürzere Suchbegriffe verwenden oder Statistiknummer direkt eingeben.

### Regionalstatistik — Kreisdaten der Statistischen Ämter

Gleiche API-Syntax wie GENESIS, eigene Credentials. Enthält Kreisdaten zu Bevölkerung und Migration, die in GENESIS fehlen. Serverseitiges Load-Balancer-Problem: ~50% der Requests schlagen fehl, Retry-Logik ist eingebaut.

| Tool | Funktion | Typische Frage |
|------|----------|----------------|
| `regional_search` | Volltextsuche in der Regionaldatenbank | "Ausländeranteil Kreise NRW" |
| `regional_table` | Datentabelle mit regionaler Auflösung | "Ausländer nach Staatsangehörigkeit in der StädteRegion Aachen" |

### Dashboard Deutschland — aktuelle Konjunkturindikatoren

Keine Authentifizierung. Vorgefertigte Indikatoren ohne eigene Filterung nach Merkmalen.

| Tool | Funktion | Typische Frage |
|------|----------|----------------|
| `dashboard_list` | Indikatoren auflisten, optional nach Stichwort | "Welche Konjunkturindikatoren gibt es?" |
| `dashboard_indicator` | Zeitreihe eines Indikators abrufen | Mietpreise, Inflationsrate |

### Sonstiges

| Tool | Funktion |
|------|----------|
| `health` | Erreichbarkeit aller 5 API-Quellen prüfen. Bei Problemen zuerst aufrufen. |

## Quellenauswahl — Routing-Tabelle

Für Arbeitsmarkt, Beschäftigung, SGB II und Migration+Arbeitsmarkt **zuerst die BA-API** — sie ist aktueller und regionaler als GENESIS. GENESIS nur für Themen, die die BA nicht abdeckt, oder für lange historische Reihen.

| Fragetyp | Primäre Quelle | Ergänzend / Alternativ |
|----------|---------------|----------------------|
| Arbeitslosigkeit (aktuell, regional) | BA: `ba_arbeitsmarkt` | Dashboard für Überblick |
| Beschäftigte nach Branche | BA: `ba_beschaeftigung` | GENESIS 13111 für lange Reihen |
| Fachkräftemangel / Engpassberufe | BA: `ba_beschaeftigung` | BA-Engpassanalyse nicht in API → Web-Suche |
| SGB II / Bürgergeld (aktuell, regional) | BA: `ba_grundsicherung` | GENESIS 22011 für lange Reihen |
| Ausländer nach Aufenthaltsstatus | GENESIS: 12521 | Regionalstatistik für Kreisdaten |
| Zu-/Fortzüge (Wanderung) | GENESIS: 12711 | Regionalstatistik für Kreisdaten |
| Migrationshintergrund / Erwerbstätigkeit | GENESIS: 12211 (Mikrozensus) | — |
| Asylbewerberleistungen | GENESIS: 22921 | — |
| Löhne nach Beruf | ⚠️ `ba_entgelt` defekt → GENESIS 62321 oder Web-Suche | — |
| Tarifverdienste nach Branche (AVR-Vergleich) | GENESIS: 62221 (quartalsweise, nach WZ2008) | 62231 für Monatsdaten |
| Löhne Strukturdaten | GENESIS: 62321 | — |
| Reallohn-Argumentation (MAV) | GENESIS 62221 + Dashboard Inflation kombinieren | — |
| Inflation / Preisentwicklung | Dashboard: `tile_1668694599167` | — |
| Wohnungsmarkt / Mieten | Dashboard: `data_woh_bruttokaltmiete` | — |
| Psychische Gesundheit / Krankheitskosten | GENESIS: 23631 | — |
| Krankenstand nach Branchen | Nicht in API → siehe Abschnitt "Krankenstand" | — |
| BAMF-Asylzahlen | Keine API → Web-Suche "BAMF Aktuelle Zahlen [Monat] [Jahr]" | — |

## Workflow

### 1. Fragestellung eingrenzen

Vier Leitfragen vor jeder Abfrage:
- **Was genau?** Bestandswert oder Zeitreihe? Aktueller Monat oder langfristige Entwicklung?
- **Welche Ebene?** Bund → GENESIS/BA. Land/Kreis → BA (Arbeitsmarkt) oder Regionalstatistik (Demographie).
- **Wie aktuell?** Arbeitsmarkt → BA (monatsaktuell). Strukturdaten → GENESIS (mit Zeitverzug).
- **Für wen?** Migrationsberatung (Behördenschreiben, Anträge) oder MAV-Arbeit (Vergleichsdaten, Verhandlungsargumente).

### 2. Daten suchen und abrufen

**BA-API:** Direkt den passenden Endpunkt mit Regionfilter aufrufen. Kreisschlüssel für StädteRegion Aachen: 05334.

**GENESIS/Regionalstatistik:** Dreistufig vorgehen:
1. `genesis_search` / `regional_search` mit Stichworten → Tabellen-Codes finden
2. `genesis_metadata` → verfügbare Merkmale und Zeiträume prüfen
3. `genesis_table` / `regional_table` mit Filtern → konkrete Zahlen

**Dashboard:** `dashboard_indicator` mit bekannter Indikator-ID direkt aufrufen.

### 3. Datenqualität prüfen

- GENESIS-Sonderzeichen: "..." = Geheimhaltung, "." = genau Null, "/" = nicht sicher genug
- BA-Daten sind vorläufig (Wartezeit-Revision)
- Datum der letzten Aktualisierung prüfen und Zeitverzug transparent machen
- Werte unter 3 auf Kreisebene sind oft gesperrt (Datenschutz)

### 4. Ergebnis aufbereiten

Jede Antwort muss enthalten: Quelle, Tabellencode oder Endpunkt, Stand (Datum). Keine Zahl ohne Quellenangabe.

**Für Migrationsberatung** — Quellenangabe im Behörden-Format: "Quelle: Statistik der Bundesagentur für Arbeit, [Endpunkt], Stand [Monat/Jahr]" oder "Quelle: Statistisches Bundesamt, Tabelle [Code], Stand [Datum]". Regionale Daten (Aachen/NRW) bevorzugen.

**Für MAV-Arbeit** — Branchenvergleiche aus BA-Beschäftigungsdaten (Sozialwesen vs. Gesamtwirtschaft). Reallohn-Argumentation: Entgeltatlas + Dashboard-Inflation kombinieren. Krankheitskostenrechnung (GENESIS 23631) für BEM/Gefährdungsbeurteilung.

## Krankenstand nach Branchen — Sonderfall

Branchenspezifische Krankenstandsdaten stammen von den gesetzlichen Krankenkassen, nicht von Destatis oder der BA. Weder BAuA noch GBE-Bund haben eine offene API.

Fallback-Strategie:
1. Web-Suche: "BAuA SUGA [aktuelles Jahr] Arbeitsunfähigkeit Wirtschaftszweig"
2. Referenzformat: "Quelle: BMAS/BAuA (Jahr): Sicherheit und Gesundheit bei der Arbeit — Berichtsjahr [Jahr]. Download von www.baua.de/suga"

Schlüsselzahl für MAV-Argumentation: "Öffentliche und sonstige Dienstleister, Erziehung, Gesundheit" hat den höchsten Krankenstand aller Branchen (2023: 258 AU-Fälle je 100 GKV-Mitgliedsjahre, Durchschnitt: 226).

## Grundsätze

1. **Quellenangabe ist Pflicht.** Jede Zahl braucht: Quelle, Endpunkt/Tabellencode, Stand.
2. **Keine Hochrechnungen.** Wenn Daten nur bis 2023 reichen, das transparent sagen.
3. **Korrelation ≠ Kausalität.** Muster zeigen, Schlüsse dem Nutzer überlassen.
4. **Regionale Daten bevorzugen.** StädteRegion Aachen (AGS 05334) oder NRW, nicht nur Bund.
5. **BA für Aktualität, GENESIS für Tiefe, Dashboard für Konjunktur.** Komplementär nutzen.
6. **Defekte Tools umgehen.** `ba_entgelt` und `ba_migration` nicht aufrufen — Alternativen aus Routing-Tabelle verwenden.
