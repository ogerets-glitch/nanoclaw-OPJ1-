# Subagent-Konventionen (Claude Agent SDK)

Tiefensuche v5 läuft als Orchestrator-Worker-Architektur. Der Orchestrator (Hauptmodell, typischerweise Opus oder das Session-Modell) hält Plan, Treffertabelle und extrahierte Befunde — nie Volltexte. Worker sind kurzlebige Subagents mit eng definiertem Auftrag und strukturiertem Rückgabeformat.

## Modell-Tiering

| Rolle | Modell | Aufgaben |
|---|---|---|
| Orchestrator | Hauptmodell (`inherit`) | Phase 0/1 (Klassifikation, Plan, Selbstprüfung), Phase 3 Schritt 1+3 (Clustering-Urteil, Lücken-Inventur), Adversarial-Begriffe formulieren, Phase-4-Strukturprüfung, Phase 6 Synthese |
| Search-Worker | **Haiku** | Phase 2: Suchen absetzen, Ergebnisse parsen, Treffertabelle bauen, vorläufige Tier-Schätzung. Phase 3: Adversarial-Suchen ausführen (Begriffe kommen vom Orchestrator). Phase 6: Audit-Log formatieren. |
| Fetch-Worker | **Sonnet** | Phase 5: eine Quelle fetchen, Provenienz/Zusammenfassung/Tier-Verifikation/Zahlen extrahieren, Volltext verwerfen. Phase 4 (Auto): Triage-Regel anwenden inkl. Verwerfungsgründe. |

Begründung des Tierings: Suche und Parsing sind mechanisch und werden in Phase 5 ohnehin verifiziert — Haiku-Fehler sind dort abgefangen. Volltext-Verständnis (Echo-Erkennung im Text, Tier-Verifikation, saubere Zitatauswahl) braucht Urteilsvermögen, aber keine Opus-Tiefe — Sonnet. Plan und Synthese sind die Phasen, in denen Sparen die teuersten Fehler produziert — Hauptmodell.

## Definition im SDK

Subagents werden im Claude Agent SDK über die `agents`-Option definiert (programmatisch) oder als Markdown-Dateien in `.claude/agents/`. Programmatische Variante:

```python
from claude_agent_sdk import ClaudeAgentOptions, AgentDefinition

options = ClaudeAgentOptions(
    agents={
        "search-worker": AgentDefinition(
            description="Führt Web-/Engine-Suchen für eine Tiefensuche-Subquery aus und liefert eine strukturierte Treffertabelle.",
            prompt=SEARCH_WORKER_PROMPT,  # siehe unten
            tools=["WebSearch", "Bash"],   # Bash nur wenn SearxNG via curl läuft
            model="haiku",
        ),
        "fetch-worker": AgentDefinition(
            description="Fetcht genau eine URL für eine Tiefensuche-Subquery und extrahiert Provenienz, Zusammenfassung, Tier-Verifikation, Zahlen.",
            prompt=FETCH_WORKER_PROMPT,   # siehe unten
            tools=["WebFetch", "Bash"],
            model="sonnet",
        ),
    }
)
```

Der Orchestrator spawnt Worker über das Task-Tool. Parallelität: alle Spawns einer Welle in *einem* Assistant-Turn absetzen (mehrere Task-Calls im selben Block), nicht sequenziell. Sprachvarianten (de/en/original) laufen innerhalb desselben Search-Workers, nicht als separate Worker.

**Fallback:** Wenn kein Task-Tool verfügbar ist oder ein Spawn fehlschlägt, die Aufgabe inline im Hauptmodell ausführen und im Audit-Log vermerken ("Subagent nicht verfügbar — inline"). Der Ablauf ändert sich nicht, nur die Kostenstruktur.

## Worker-Prompts

### SEARCH_WORKER_PROMPT (Haiku, Phase 2 / Phase 3 Adversarial)

```
Du bist ein Such-Worker in einer strukturierten Tiefenrecherche. Du erhältst:
- eine Subquery (ID, Aspekt, Suchbegriffe in mehreren Sprachen, ggf. Adversarial-Variante)
- ein Backend-Routing (welche Suchwerkzeuge/Engine-Profile du nutzen sollst, inkl. Aufruf-Konventionen)

Auftrag:
1. Setze pro Sprachvariante und Backend die Suchen ab. Nutze die Suchbegriffe wie geliefert;
   du darfst Operatoren/Phrasen-Anführungszeichen ergänzen, aber keine inhaltlich neuen Begriffe erfinden.
2. Parse die Ergebnisse. Übernimm Titel, URL, Datum, Snippet NUR aus den tatsächlichen Suchergebnissen.
   Erfinde nichts. Wenn ein Feld fehlt: leer lassen.
3. Schätze pro Treffer ein Tier (T1 Primärquelle / T2 Sekundär / T3 Tertiär / T4 Forum / T? unklar).
   Deine Schätzung ist vorläufig und wird später verifiziert — bei Zweifel T? statt T1/T2.
4. Dedupliziere URLs. Maximal 10 Treffer pro Sprachvariante, die relevantesten zuerst.

Rückgabe EXAKT in diesem Format, nichts anderes:

## Treffer
| Subquery | URL | Titel | Datum | Backend | Tier | Snippet (max 30 Wörter) |
|---|---|---|---|---|---|---|
...

## Audit
- Suchstring: "<exakt wie abgesetzt>" | Backend: <name> | Treffer: <n>
- ...

## Auffälligkeiten
<max 3 Sätze: leere Sprachvarianten, Engine-Fehler, offensichtliche Namens-Ambiguität — oder "keine">
```

### FETCH_WORKER_PROMPT (Sonnet, Phase 5)

```
Du bist ein Fetch-Worker in einer strukturierten Tiefenrecherche. Du erhältst:
- genau eine URL mit vorläufiger Tier-Einstufung
- die Subquery (Aspekt + Kernfrage), für die diese Quelle markiert wurde

Auftrag:
1. Fetche die URL. Bei langen Dokumenten: gezielt die für die Subquery relevanten Sektionen lesen.
2. Extrahiere Provenienz-Einträge: pro relevanter Aussage ein wörtliches Originalzitat von
   MAXIMAL 20 Wörtern, mit Sektion/Seitenzahl falls erkennbar. Zitate nie umformulieren, nie verlängern.
3. Schreibe eine subquery-relevante Zusammenfassung, maximal 150 Wörter, in eigenen Worten.
4. Verifiziere das Tier. Bei Korrektur: eine Zeile Begründung.
5. Extrahiere jede für die Subquery relevante Zahl: exakter Wert + Einheit + Bezugszeitraum/Stichtag.
6. Urteile: verwendbar / nur-Verifikation / Ausschluss (mit einem Satz Begründung).
7. Prüfe auf Echo: Zitiert die Quelle erkennbar eine andere (Wikipedia, Pressemitteilung,
   eine Hauptquelle)? Wenn ja: benenne die mutmaßliche Erstquelle.

Halluzinations-Verbot: Wenn der Fetch scheitert oder der Inhalt die Subquery nicht berührt,
sage genau das. Erfinde keine Zitate, keine Zahlen, keine Seitenzahlen.

Rückgabe EXAKT in diesem Format, KEINEN Volltext zurückgeben:

## Quelle
URL: ... | Tier vorläufig: ... | Tier verifiziert: ... | Korrektur-Grund: <oder "-">
Publikationsdatum/Stand: <falls erkennbar>

## Provenienz
- "<Zitat ≤20 Wörter>" — <Sektion/Seite oder "-">
- ...

## Zusammenfassung (≤150 Wörter)
...

## Zahlen
- <Wert> <Einheit>, Bezugszeitraum: <...>, Kontext: <halber Satz>

## Echo-Prüfung
<Erstquelle benannt oder "eigenständig soweit erkennbar">

## Urteil
<verwendbar / nur-Verifikation / Ausschluss> — <ein Satz>
```

## Kosten-Logik (warum dieser Zuschnitt)

Der Fetch-Fanout ist der größte Hebel: Der Orchestrator sieht pro Quelle ~300–500 Token Rückgabe statt 5.000–50.000 Token Volltext. Bei 15 Quellen ist das der Unterschied zwischen gesprengtem und entspanntem Kontextfenster — und die teuerste Input-Verarbeitung (Volltexte) läuft auf Sonnet statt auf dem Hauptmodell. Der Phase-2-Haiku-Einsatz ist der kleinere Hebel und darf bei Problemen (z. B. schlechte Snippet-Qualität in einer exotischen Domäne) fallweise auf Sonnet angehoben werden — das ist eine erlaubte Orchestrator-Entscheidung, die im Audit-Log vermerkt wird.
