---
name: wisdom
description: Semantische Suche in klassischen Weisheits-Texten — findet thematisch passende Stellen zu einer Frage oder Lebenslage, auch wenn die genauen Worte nicht im Text stehen. Aktuell indiziert (drei Korpora, ~540 Chunks): Sun Tzu "The Art of War" englisch (Giles 1910), Sun Tzu "Die Kunst des Krieges" deutsch (Clavell-Edition nach Giles), I Ging "Buch der Wandlungen" deutsch (Wilhelm 1923). Triggert bei "/wisdom <frage>", "was sagt Sun Tzu zu …", "was sagt das I Ging zu …", "Hexagramm zu …", "strategische / daoistische Sicht auf …" oder allgemein wenn jemand klassischen Rat sucht. Cross-lingual via bge_multilingual_gemma2.
allowed-tools:
  - Bash(bun run /app/skills/wisdom/wisdom.ts:*)
---

# wisdom — Klassische Weisheit semantisch durchsuchen

## Was der Skill macht

Findet Passagen aus klassischen Strategie- und Weisheits-Texten, die thematisch zu einer Frage passen — basierend auf Bedeutung, nicht auf Wortmatch. Beispiele:

- *„Was tun wenn ich auf zwei Fronten gefordert werde?"* → Sun-Tzu-Passagen über Kessel-Situationen und Kräfteteilung
- *„Wie soll ich auf einen ungeduldigen Lehrling reagieren?"* → I-Ging-Hexagramm 4 (Mong, Die Jugendtorheit) — der Lehrer wartet, bis der Schüler ihn aufsucht
- *„Was sagt das I Ging zu beharrlich-bleiben in unsicheren Zeiten?"* → mehrere passende Hexagramme mit Urteils- und Bild-Texten

## Wann triggern

- **Slash-Befehl** `/wisdom <frage>` — explizite Anfrage
- **Natürliche Phrasen** — "was sagt Sun Tzu zu …", "Sun-Tzu-Sicht auf …", "strategische Sicht auf …"
- **Frei** — wenn Oliver oder ein anderer Agent nach Strategie, Konflikt, Vorbereitung, Führung, Verhandlungstaktik fragt, kann der wisdom-Skill mit-konsultiert werden, um klassische Stimmen einzubringen

## Aufruf

```bash
bun run /app/skills/wisdom/wisdom.ts search "<deine Frage>" [k]
```

`k` ist optional (Default 5) und gibt an, wie viele Top-Treffer zurückkommen sollen.

Beim **allerersten Aufruf** in einem neu gespawnten Container baut der Skill seinen Embedding-Cache automatisch (~30 Sekunden, einmalig pro Container-Lifecycle, ein paar Cent über Infomaniak). Folge-Aufrufe sind schnell (~500 ms).

Weitere Modi:
- `bun run /app/skills/wisdom/wisdom.ts info` — DB-Stats, Cache-Pfad
- `bun run /app/skills/wisdom/wisdom.ts build [--force]` — manueller Rebuild

## Output-Format

Pro Treffer:

```
- Sun Tzu — The Art of War (Giles 1910), Kapitel 5 (Energy), Verse 13–17
  Score: 0.682
  13. The quality of decision is like the well-timed swoop of a falcon...
```

Niedrige Scores (< 0.40) sind in der Regel schwache Treffer und ein Hinweis darauf, dass die Frage nicht gut zum Korpus passt. **Cross-lingual** (deutsche Frage → englischer Treffer) liegt typisch ~0.10–0.15 unter mono-lingual — Werte um 0.45–0.55 sind in dem Modus also schon brauchbar; bei englischer Frage erwartet man eher 0.55–0.70.

Die Treffer-Auswahl nutzt **MMR** (Maximal Marginal Relevance, λ=0.7) statt purem Top-K — das verhindert, dass mehrere fast identische Verse aus demselben Kapitel die Liste fluten, und nutzt die fünf Plätze breiter.

## Wie der Output verwendet wird

Die Treffer sind **Originalstellen** mit Quelle. **Nicht einfach paraphrasieren** und als eigene Aussage präsentieren — Oliver sieht gerne den Originaltext (Englisch in diesem Fall) und entscheidet selbst, wie er ihn auf seine Lage bezieht. Bei Bedarf kann der aufrufende Agent eine kurze deutsche Sinn-Zusammenfassung dazustellen, klar getrennt von der Quelle.

## Umfang

Drei Korpora, ~540 Chunks total:

| Korpus | Sprache | Chunks | Quelle |
|---|---|---|---|
| Sun Tzu — *The Art of War* | Englisch | 81 | Lionel Giles 1910 (Public Domain, Project Gutenberg #132) |
| Sunzi — *Die Kunst des Krieges* | Deutsch | 98 | Clavell-Edition nach Giles (wrd.ch/triboni) |
| I Ging — *Buch der Wandlungen* | Deutsch | 367 | Richard Wilhelm 1923 (Public Domain seit 2001, METIS-Ausgabe 2023) |

I Ging ist pro Hexagramm in 3 oder mehr Chunks aufgeteilt: Zeichen + Urteil, Bild, Linien (in 1–3 Stücken). Sun Tzu ist pro Kapitel in 4–13 Vers-/Abschnitt-Gruppen aufgeteilt.

- Embedding-Modell: `bge_multilingual_gemma2` (3584 Dimensionen, multilingual, Schweizer Hosting) via Infomaniak
- Cache liegt unter `~/.cache/wisdom/wisdom.sqlite` (Container-lokal, geht bei Container-Stop verloren — wird beim nächsten Search-Aufruf neu gebaut)

## Bewusste Grenzen

- **Keine Interpretation durch den Skill.** Wertung und Übertragung auf die konkrete Lage ist Aufgabe des Users / des aufrufenden Agents. Skill liefert nur den Originaltext mit Quelle.
- **Cache pro Container.** Bei jedem neuen Container-Lifecycle einmalig ~60 s Build-Zeit, ein paar Cent über Infomaniak. Kein Drama, aber zu wissen.
- **Cross-lingual ist nicht symmetrisch.** Eine deutsche Frage findet englische Sun-Tzu-Treffer mit ~0.10 Score-Penalty gegenüber dem deutschen Sun Tzu. Wenn beide Korpora hochkommen, bevorzuge in der Regel die deutsche Quelle für die Zitate.
