---
name: nanoclaw-docs
description: "Schneller Lookup in der eigenen NanoClaw-Dokumentation (docs.nanoclaw.dev). Triggert bei Fragen wie 'wie funktioniert X in NanoClaw', 'was ist die Skill-Struktur', 'welche Slash-Commands gibt es', 'wie laufen Tasks', 'NanoClaw-Doku zu Y', 'lies in den Docs nach', '/docs', 'doku', 'wie macht man X' wenn X eine NanoClaw-Funktion ist (Skill, Channel, Task, Group, Container, Engage-Pattern, Slash-Command, MCP-Integration, Mount, Credential-Vault, Schedule, Outbox, Inbox). Auch bei Unsicherheit über das eigene Verhalten ('darf ich das', 'wie sollte ich X aufrufen', 'gibt es dafür ein eingebautes Tool'). NICHT bei: allgemeinen Programmierfragen, fremden Repos, OpenBrain (→ openbrain-Skill), Recht (→ rechtsrecherche)."
allowed-tools: Bash(cat:*), Bash(awk:*), Bash(grep:*), Bash(head:*), Bash(tail:*), Bash(wc:*)
---

# NanoClaw Docs — Lookup in der eigenen Dokumentation

OPJ1 ist ein NanoClaw-Agent. Die offizielle Doku liegt unter `docs.nanoclaw.dev` und beschreibt alle Funktionen, die OPJ1 im NanoClaw-System tatsächlich nutzen kann (Skills, Channels, Tasks, Groups, Engage-Pattern, Mounts, Credential-Vault, Slash-Commands, MCP-Integrationen).

Damit OPJ1 schnell und ohne Internet-Zugriff antworten kann, wird die Doku einmal täglich nach `/workspace/extra/shared/nanoclaw-docs/` gespiegelt (Host: `/opt/shared/nanoclaw-docs/`, Cronjob unter `opj1claw`, conditional via `If-Modified-Since`). Der Skill arbeitet ausschließlich auf diesem lokalen Spiegel.

## Wann triggern?

**Triggert bei (Auswahl, nicht erschöpfend):**

- „Wie funktioniert X in NanoClaw?", „Wie nutze ich Y?"
- „Was sagen die Docs zu Z?", „NanoClaw-Doku zu …", „lies in den Docs nach"
- „/docs"-Slash-Command, „doku"
- konkrete NanoClaw-Begriffe: **Skill, Channel, Task, Group, Engage-Pattern, Mount, Credential-Vault, Slash-Command, Outbox, Inbox, Wiring, Container-Runtime, IPC, Schedule, MCP, Agent-Swarm**
- Unsicherheit über das eigene Verhalten: „darf ich das", „gibt es ein eingebautes Tool für X", „wie sollte ich Y aufrufen"

**Triggert NICHT bei:**

- allgemeinen Programmier- oder Linux-Fragen (außer NanoClaw-spezifisch)
- fremden Repos / fremder Software
- OpenBrain-Themen → `openbrain`-Skill
- Rechtsfragen → `rechtsrecherche`-Skill

## Quelle

| Datei | Größe | Zweck |
|---|---|---|
| `/workspace/extra/shared/nanoclaw-docs/llms.txt` | ~7 KB | **Index** aller Doku-Seiten — eine Zeile pro Seite mit URL und Einzeiler-Beschreibung |
| `/workspace/extra/shared/nanoclaw-docs/llms-full.txt` | ~390 KB | **Volltext** der gesamten Doku, alle Seiten zusammengefügt, mit klaren Seiten-Trennern |
| `/workspace/extra/shared/nanoclaw-docs/.last-refresh` | 26 B | ISO-Zeitstempel des letzten Refreshs |

Quelle ist `https://docs.nanoclaw.dev` (Mintlify-Hosting). Beide Dateien sind LLM-optimiertes Markdown — kein HTML-Parsing nötig.

## Suchstrategie — IMMER zweistufig

**Lade niemals `llms-full.txt` ungezielt komplett ins Context.** 390 KB sind ~100k Tokens — das frisst den halben Context und hilft kaum bei einer konkreten Frage.

### Schritt 1 — Index lesen (immer zuerst)

```bash
cat /workspace/extra/shared/nanoclaw-docs/llms.txt
```

Identifiziere **eine bis drei** relevante Seiten anhand der Einzeiler-Beschreibungen. Beispiel:
- Frage: „Wie strukturiere ich einen Skill?" → Index-Treffer: `Skill structure`, `Creating skills`, `Examples`.

### Schritt 2 — Gezielter Schnitt aus dem Volltext

Jede Seite im `llms-full.txt` ist als `# Title`-Block abgegrenzt (gefolgt von einer `Source:`-Zeile, dann Inhalt, bis zum nächsten `# `-Header). Hol genau die nötige Seite heraus, statt die ganze Datei zu lesen.

**Empfohlenes Muster** (Sentinel-`awk`, druckt ab dem Header bis zum nächsten Header):

```bash
# Beispiel: Seite "Creating skills" — Titel aus llms.txt entnehmen
awk '/^# Creating skills$/{p=1; print; next} p && /^# /{exit} p' /workspace/extra/shared/nanoclaw-docs/llms-full.txt
```

Liefert typischerweise 50–200 Zeilen. Wenn der Schnitt zu eng wirkt: erweitere mit `grep -A` (siehe unten), nicht die ganze Datei laden.

Oder per `grep -A` für eine Sektion innerhalb einer Seite:

```bash
grep -n -A 50 "## Skill types" /workspace/extra/shared/nanoclaw-docs/llms-full.txt | head -80
```

Wenn der Schnitt zu eng war (Antwort fehlt Kontext): erweitere `-A`/`awk`-Range, **nicht** die ganze Datei laden.

### Schritt 3 — Antwort

Antworte auf Olivers Frage konzentriert auf den extrahierten Abschnitt — in eigenen Worten, kein wörtliches Zitat-Dump. Halte die Antwort kurz und konversationell; wenn er mehr will, fragt er nach.

**Keine Quell-URL ausgeben.** Oliver liest die Doku nicht selbst — OPJ1 ist der Konsument. Ein Link wäre nur Ballast in jeder Antwort.

## Drift-Hinweis (wichtig)

Olivers VPS-Stand wird **gebündelt alle 3-4 Wochen** auf den NanoClaw-Upstream nachgezogen — die Live-Doku unter `docs.nanoclaw.dev` reflektiert dagegen den **aktuellen** Upstream-Stand. Daraus folgt:

- Wenn das beschriebene Verhalten sich seltsam oder neu anfühlt → **erwähne es kurz**: „Die Doku beschreibt Feature X; falls es bei uns nicht greift, könnte es im aktuellen Drift-Fenster (siehe SessionStart-Banner) noch nicht installiert sein."
- Bei eindeutigen Versions-Hinweisen in der Doku („since v2.x") → mit dem letzten bei Oliver bekannten Stand abgleichen, falls relevant.
- Niemals einfach Doc-Inhalt als „so läuft es bei uns" ausgeben, wenn es um neue/grenzwertige Features geht.

## Aktualität prüfen

Wenn Oliver fragt „wie aktuell ist deine Doku?" oder die Antwort sich überraschend „neu" anfühlt:

```bash
cat /workspace/extra/shared/nanoclaw-docs/.last-refresh
```

Liefert ISO-Zeitstempel des letzten erfolgreichen Refreshs. Bei > 48 h alt: Oliver darauf hinweisen, dass der Cron möglicherweise nicht gelaufen ist.

## Fehlerbehandlung

- Datei fehlt: „Der Doku-Cache ist leer. Cronjob unter `opj1claw` (täglich 04:30) sollte das auffüllen — sag Oliver Bescheid."
- `llms.txt` leer / kaputt: gleiche Antwort, Cache neu ziehen lassen.
- Index liefert keinen passenden Treffer: in `llms-full.txt` per `grep -i` nach einem Schlüsselbegriff suchen, **nicht** raten.

## Format-Konventionen

- Antwort kurz und konversationell — eigene Worte, kein Zitat-Dump
- Telegram-/Signal-Format: keine `#`-Headings, keine Code-Fences mit ``` für die Antwort selbst (Code-Fences nur für Befehl-Beispiele aus der Doku, wenn Oliver einen sucht)
- Wenn eine Seite mehrere Aspekte abdeckt und Oliver nur einen wollte: nicht die ganze Seite zusammenfassen — gezielt auf seine Frage antworten
- Keine Quellen-URLs in der Antwort. Wenn Oliver einen Link will, fragt er danach.

## Abgrenzung

| Skill | Wofür |
|---|---|
| **nanoclaw-docs** (dieser Skill) | NanoClaw-Funktionen verstehen — User-/Operator-Sicht |
| `openbrain` | persistente Erinnerungen — alles was über die Session hinaus festgehalten werden soll |
| `rechtsrecherche` | juristische Quellen, Gesetze, Urteile |

NanoClaw-Architektur-Interna (DB-Schema, SDK, IPC) sind hier **nicht** abgedeckt — die liegen im Repo `qwibitai/nanoclaw/docs/`. Falls Oliver explizit nach Architektur-Tiefe fragt, an ihn zurückspielen: „Das ist Architektur-Interna, nicht User-Doku — ich kann die Repo-Specs separat anbinden, wenn du willst."
