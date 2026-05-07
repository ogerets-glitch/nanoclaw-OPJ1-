---
name: wisdom
description: Semantische Suche in alten Weisheits-Texten — findet thematisch passende Stellen zu einer Frage oder Lebenslage, auch wenn die genauen Worte nicht im Text stehen. Aktuell indiziert: Sun Tzu, "The Art of War" (Lionel Giles 1910, Public Domain). Triggert bei "/wisdom <frage>", "was sagt Sun Tzu zu …", "Sun-Tzu-Sicht auf …", oder allgemein wenn jemand strategischen / taktischen Rat aus klassischen Texten sucht. Cross-lingual via bge_multilingual_gemma2 — deutsche Anfrage findet englische Treffer.
allowed-tools:
  - Bash(bun run /app/skills/wisdom/wisdom.ts:*)
---

# wisdom — Strategische Weisheit semantisch durchsuchen

## Was der Skill macht

Findet Passagen aus klassischen Strategie-/Weisheits-Texten, die thematisch zu einer Frage passen — basierend auf Bedeutung, nicht auf Wortmatch. Beispiel: "Was tun wenn ich auf zwei Fronten gefordert werde?" findet Sun-Tzu-Passagen über Kessel-Situationen und Kräfteteilung, ohne dass diese Worte im Original vorkommen.

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

Niedrige Scores (< 0.45) sind in der Regel schwache Treffer und ein Hinweis darauf, dass die Frage nicht gut zum Korpus passt.

## Wie der Output verwendet wird

Die Treffer sind **Originalstellen** mit Quelle. **Nicht einfach paraphrasieren** und als eigene Aussage präsentieren — Oliver sieht gerne den Originaltext (Englisch in diesem Fall) und entscheidet selbst, wie er ihn auf seine Lage bezieht. Bei Bedarf kann der aufrufende Agent eine kurze deutsche Sinn-Zusammenfassung dazustellen, klar getrennt von der Quelle.

## Umfang

- 81 Chunks aus 13 Kapiteln des Sun Tzu (Giles 1910)
- Embedding-Modell: `bge_multilingual_gemma2` (3584 Dimensionen, multilingual) via Infomaniak (Schweiz)
- Cache liegt unter `~/.cache/wisdom/wisdom.sqlite` (Container-lokal, geht bei Container-Stop verloren — wird beim nächsten Search-Aufruf neu gebaut)

## Bewusste Grenzen

- **Aktuell nur Sun Tzu.** I-Ging als zweites Korpus geplant, sobald sauber gemeinfreie deutsche Wilhelm-Quelle verfügbar.
- **Originaltext ist Englisch** (Giles 1910). Deutsche Anfragen funktionieren über das multilingual-Embedding, der Treffer-Text bleibt aber Englisch.
- **Keine Interpretation durch den Skill.** Wertung und Übertragung auf die konkrete Lage ist Aufgabe des Users / des aufrufenden Agents.
- **Cache pro Container.** Bei jedem neuen Container-Lifecycle einmalig 30 s Build-Zeit, ein paar Cent. Kein Drama, aber zu wissen.
