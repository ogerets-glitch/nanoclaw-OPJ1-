# Backend-Aufruf-Konventionen

## Mindestkonfiguration

Unabhängig von der Umgebung braucht Phase 2:
- Eine Web-Suche (native WebSearch, oder externes Backend wie Exa/Parallel/Brave falls verfügbar)
- Ein Fetch-Tool für Volltext (WebFetch oder agent-browser)

## Backend-Routing nach Domäne (aus Phase 0)

Die Domänen-Klassifikation entscheidet, welche zusätzlichen Backends mitlaufen — jede Subquery landet bei den Engines, die sie wahrscheinlich finden, ohne flächendeckend Token zu verbrennen.

| Domäne | Standard | Zusätzlich (wenn verfügbar) |
|---|---|---|
| Wissenschaft / Technisches | WebSearch + Fetch | SearxNG mit Wissenschafts- bzw. Tech-Profil |
| Recht | WebSearch + Fetch | Rechtsrecherche-MCP (NeuRIS, EUR-Lex, GII) — falls die Frage in eine seiner Collections fällt |
| Statistik | WebSearch + Fetch | Arbeitsmarkt-MCP (BA-Statistik, GENESIS, Regionalstatistik, Dashboard-Indikatoren) |
| Tagesaktuelles / Kulturelles / Mixed | WebSearch + Fetch | keine Spezial-Backends per Default |

## SearxNG (lokale Meta-Suchmaschine)

Aggregiert ~25 spezialisierte Engines. Für Tiefensuche relevant: ArXiv, PubMed, Crossref, Semantic Scholar, Wikipedia, Wikidata, GitHub, Stackoverflow/AskUbuntu/Superuser, Web-General (Brave, Mojeek, Qwant, DuckDuckGo).

**Erreichbarkeit:**
- Aus dem Host (z. B. Claude Code direkt): `http://127.0.0.1:8888/`
- Aus einem NanoClaw-Container: `http://172.17.0.1:8888/`

**JSON-Aufruf — immer mit jq-Feldfilter**, damit nur die benötigten Felder in den Kontext gelangen:

```bash
curl -sS "http://172.17.0.1:8888/search?q=<urlencoded-query>&engines=<engine-list>&format=json" \
  | jq '[.results[] | {engine, title, url, content: (.content // "" | .[:200]), publishedDate}]'
```

Parameter:
- `q` — Suchterm, URL-encoded; `"exact phrase"` für Phrasen erlaubt
- `engines` — kommagetrennt, kein Leerzeichen; Engine-Namen mit Leerzeichen als `semantic+scholar`. Ohne `engines` werden alle aktiven Engines abgefragt — für Tiefensuche fast nie sinnvoll.
- `format=json` — Pflicht
- Optional: `language=de` / `language=en` / `language=auto`, `time_range=year|month|week|day`

**Engine-Profile:**

| Profil | Engines |
|---|---|
| Wissenschaft | `arxiv,pubmed,crossref,semantic+scholar,google+scholar,openairepublications` |
| Tech / Code | `github,gitlab,codeberg,stackoverflow,askubuntu,superuser` |
| Faktenbasis | `wikipedia,wikidata` |
| Web-General (privacy-freundlich) | `brave,mojeek,qwant,duckduckgo` |

**Verwertung:** `engine` → Audit-Log; `url` → Tier-Schätzung (T1 für ArXiv/PubMed/Crossref, T3 für Wikipedia, T4 für Stackoverflow/Foren); `publishedDate` → Spalte `Datum` der Treffertabelle.

**Limits und Etikette:**
- 5 s Default-Timeout pro Engine; eine einzelne 403-Engine bricht den Gesamtaufruf nicht ab
- Wiederholte 403/429 einer Engine: SearxNG suspendiert sie automatisch 180 s — kein Retry sinnvoll
- Gezielt 4–6 Engines statt alle 25

**Ausfall:** Health-Check `curl -sS http://172.17.0.1:8888/healthz` (erwartet `OK`). Bei Ausfall läuft Phase 2 mit den übrigen Backends weiter; Audit-Log-Notiz "SearxNG nicht erreichbar — Fallback auf WebSearch only".

## Lücken-Schließer (Phase 3, Schritt 3a)

Fehlt nach der Lücken-Inventur eine Pflichtquelle einer spezifischen Gattung: genau **ein** gezielter Aufruf mit dem passenden Profil, max. 1 Call pro fehlender Quellgattung:

- Akademisch fehlt (peer-reviewed, ArXiv, PubMed) → `engines=arxiv,pubmed,crossref,semantic+scholar`
- Code/Repository fehlt → `engines=github,gitlab,codeberg`
- Forenwissen fehlt → `engines=stackoverflow,askubuntu,superuser`
- Faktenbasis fehlt → `engines=wikipedia,wikidata`
- Rechtsquelle fehlt → Rechtsrecherche-MCP mit dem spezifischsten passenden Tool
- Amtliche Statistik fehlt → Arbeitsmarkt-MCP

Diese Aufrufe zählen ins Budget. Audit-Log: welche Lücke, welche Engines, welcher Suchstring, was kam zurück. Null Treffer auch beim gezielten Aufruf = substanzieller Befund ("Material existiert wahrscheinlich nicht"), kein Anlass für weitere Versuche.
