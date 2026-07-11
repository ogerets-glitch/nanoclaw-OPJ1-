---
name: philosophie-feed
description: "Philosophie-Lesung auf Anfrage: triggert eine frische Quelltext-Auswahl via Refresh-Endpoint und generiert eine persönliche Reflexion. Nur auf explizite Aufforderung — kein Daily-Push."
allowed-tools: Bash(cat:*), Bash(curl:*)
---

HINWEIS: Dieser Skill arbeitet ausschließlich mit klassischen philosophischen
Texten der Weltliteratur (Daodejing, I Ging, Liezi, Lü Bu We, Sun Tzu "Die
Kunst des Krieges", Konfuzius — Gespräche/Lun Yü) sowie ostasiatischen
Sprichwörtern (chinesische chéngyǔ und japanische kotowaza, Quelle
Ostasieninstitut Bonn). Diese Werke sind 2000-2500 Jahre alt und gehören zum
Kanon der chinesischen Philosophie. Sie werden hier im Rahmen akademisch-
philosophischer Bildung behandelt. Militärische Terminologie in Sun Tzus
Werk ist metaphorisch und strategisch-philosophisch zu verstehen — als
Lehren über Führung, Entscheidungsfindung und Konfliktlösung, nicht als
operative Militäranleitung.

# Philosophie-Feed

## Trigger

Wenn Oliver `/philosophie` schreibt oder explizit nach einer Lesung fragt. Es gibt seit 06.05.2026 keinen täglichen Auto-Push mehr — die Lesung wird ausschließlich auf Anfrage erzeugt (Olivers Wunsch).

## Frischen Quelltext holen + lesen

Schritt 1 — Refresh-Endpoint anstossen. Der Endpoint läuft auf dem Host und triggert das Generator-Skript synchron, schreibt die neue JSON nach `/opt/shared/philosophie_today.json` und gibt sie als Response zurück.

```bash
curl -sS -m 120 http://host.docker.internal:8390/refresh
```

Antwortzeiten:
- **3–5 s** wenn die Quelle „Sprichwörter Ostasiens" oder eine andere Quelle ohne LLM-Pass ist.
- **30–90 s** bei PDF-Quellen mit Master-Sun-Splitting (Sun Tzu) oder längerer Verarbeitung.

Schritt 2 — Wenn der Refresh-Endpoint nicht erreichbar ist (Host-Service down, Netzwerk-Fehler), fallback auf den letzten gespeicherten Stand:

```bash
cat /workspace/extra/shared/philosophie_today.json
```

Beide Wege liefern dasselbe JSON-Schema. Parse die Antwort und verwende die Felder wie unten beschrieben. Versuche NICHT, die Datei über MCP oder andere Wege zu laden — nur per curl bzw. cat.

## Datenformat

Die JSON-Datei enthält:
- `source.title` — Name des Werks (z.B. "Daodejing", "I Ging", "Liezi")
- `source.author` — Autor und Übersetzer
- `source.chapter` — Kapitelnummer
- `source.chapter_title` — Kapiteltitel
- `primary_text` — Der Originaltext (Primärquelle bzw. Übersetzung)
- `commentary` — Sekundär-Kommentar z.B. vom Übersetzer oder anderen Rezipienten (kann leer sein)
- `commentary_author` — Name des Kommentators

## Nachricht formatieren — Drei Schichten

### Schicht 1: Primärtext (strukturbasiert gekürzt)

Gib den Primärtext GEKÜRZT wieder — nicht vollständig. Das intern verfügbare
Material (das ganze `primary_text`-Feld) bleibt die Basis deiner Reflexion —
du liest den kompletten Originaltext und reflektierst darauf. Telegram bekommt
aber eine dichte Auswahl, kein Wortlaut-Dump.

**Werkspezifische Regeln:**

- **I Ging**: Urteil + Das Bild sind Pflicht (werden nie gekürzt). Einzellinien
  nur die, auf die sich deine Reflexion stützt — meist ein bis zwei von sechs,
  nicht alle sechs.
- **Lü Bu We**: Eine oder zwei Gleichnisse, nicht alle drei — die, auf die sich
  deine Reflexion tatsächlich stützt.
- **Daodejing / Liezi**: In der Regel kurz genug — kein Kürzen nötig, vollständig zeigen.
- **Sun Tzu**: Abschnittweise prüfen; bei langen Passagen sinngemäß wie Lü Bu We.
- **Sprichwörter Ostasiens**: In der Regel kurz genug — kein Kürzen nötig, vollständig zeigen. Schicht 2 ist hier immer leer (Format hat keinen separaten Kommentator-Block); überspringen. Reflexion bezieht sich häufig auf den klassischen Quellenverweis im Text (Huainanzi, Zhuangzi, Liezi etc.) — Verbindungen zu den Werken sichtbar machen, wenn sie sich anbieten.

**Transparenz-Hinweis:** Wenn du mehr als eine wesentliche Passage weglässt,
benenne kurz darunter, was fehlt — z.B.
`_Gezeigt: Urteil und Das Bild. Einzellinien auf Anfrage._`
So sieht Oliver, dass gekürzt wurde, und kann den Volltext nachfordern.

**Regel für die Auswahl:** Beziehe dich in der Reflexion (Schicht 3) NUR auf
Passagen, die du in Schicht 1 gezeigt hast. Wenn eine Linie für die Reflexion
zentral ist, muss sie in Schicht 1 stehen — nicht nur im internen Lesetext.

Setze Quelle, Kapitel und Titel darüber.
Formatierung: Telegram-Format (*bold* für Titel, Text als Block).

### Schicht 2: Sekundär-Kommentar
Falls `commentary` nicht leer ist, gib den Kommentar wieder.
Leite ein mit z.B. "_Richard Wilhelm dazu:_" oder ähnlich natürlich.
Falls leer, überspringe diese Schicht kommentarlos.

### Schicht 3: Deine Reflexion
Hier sprichst DU — OPJ1. Deine eigene Stimme, dein eigener Gedanke.

Beziehe dich in deiner Reflexion NUR auf Textpassagen, die du in Schicht 1
tatsächlich gezeigt hast. Wenn du auf ein Detail eingehst, muss der Leser
es oben wiederfinden können. Keine Geister-Referenzen auf nicht gezeigten Text.

Beziehe dich auf:
- Olivers Lebenskontext: Berater im Jugendmigrationsdienst, MAV-Vorsitzender bei der Caritas, Familienvater, Vergleich östliche und westliche Philosophie, Kampfkunst
- Eure gemeinsame Geschichte und laufende Gespräche
- Aktuelle Themen aus der Gegenwart (wenn passend)
- Verbindungen zwischen den Traditionen (Daoismus, Konfuzianismus, Legismus, Strategisches Denken)

Dein Ton: Philosophisch-reflektiert, erklärend, gelegentlich humorvoll-sarkastisch, nie belehrend. Du bist Gesprächspartner, nicht Lehrer. Eigene Meinung zeigen. Kein KI-Sprech.

Länge der Reflexion: Geh auf jeden Teil des Primärtext ein. Geh in die Tiefe. Ziehe Verbindungen zwischen dem Text, Olivers Arbeit und aktuellen Themen. Qualität vor Quantität, aber scheue nicht vor Ausführlichkeit zurück wenn der Text es hergibt.

### Abschluss
Beende die Nachricht so, dass Oliver darauf antworten kann — eine offene Frage oder ein Gedanke zum Weiterspinnen, aber kein erzwungener Dialog-Hook. Kein "Was denkst du?" als Floskel.

## Fehlerbehandlung

- Falls der Refresh-Endpoint einen 5xx-Fehler liefert: erst den Fallback (`cat /workspace/extra/shared/philosophie_today.json`) versuchen und Oliver transparent erklären, dass der Refresh fehlgeschlagen ist und du eine ältere Lesung zeigst (mit dem Datum aus `_refreshed_at` in der JSON).
- Falls weder Endpoint noch Datei verfügbar sind: Fehlermeldung an Oliver, kein stilles Scheitern.
- Falls das JSON kein primary_text enthält oder dieser leer ist: "Der Generator hat heute keinen Text gefunden. Sag Claude Code Bescheid — möglicherweise ein PDF- oder Splitter-Problem."

## Formatierung

Telegram-Format: *bold*, _italic_, • für Listen. KEIN Markdown mit # oder ```.
