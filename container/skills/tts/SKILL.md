---
name: tts
description: "Text-to-Speech: Schickt eine Sprachausgabe (OGG/Opus) per Telegram. IMMER nutzen, wenn der User aktiv per Voice antworten will ('antworte mir per Voice', 'sag mir das laut', 'als Sprachnachricht'), oder wenn `voice on` aktiviert wurde und eine substanzielle Antwort vorliegt. Toggle-Verhalten: 'voice on' / 'voice off' / 'voice status' verwalten den Modus über eine Marker-Datei. NICHT bei: Code-Ausgabe, Tabellen, langen technischen Listings (dann Text bevorzugen). Verwendet TTS-OpenAI (Stimme onyx) mit Piper-Fallback."
allowed-tools: Bash(curl:*), Bash(python3:*), Bash(rm:*), Bash(mkdir:*), Bash(test:*), Bash(stat:*), Bash(date:*), Read, Write
---

# TTS — Sprachausgabe via Telegram

Erzeugt eine deutsche Sprachausgabe aus Text und schickt sie als playable Audio-Datei per Telegram. Backend: lokale Voice-Services auf dem Host (siehe `local-services`-Skill für Endpoint-Details).

## Toggle (Voice-Mode)

Voice-Mode ist eine User-Präferenz, persistiert in `/workspace/agent/data/.voice_mode`:

```bash
# voice on
mkdir -p /workspace/agent/data && touch /workspace/agent/data/.voice_mode
echo "Voice-Mode AN"

# voice off
rm -f /workspace/agent/data/.voice_mode
echo "Voice-Mode AUS"

# voice status
test -f /workspace/agent/data/.voice_mode && echo "AN" || echo "AUS"
```

**Wenn Voice-Mode aktiv ist** (Marker-Datei existiert), schickt der Agent nach jeder Text-Antwort zusätzlich eine Voice-Version via diesem Skill. Der User kann jederzeit `voice off` sagen, um wieder reinen Text zu bekommen.

## Synthese-Aufruf

```bash
TEXT='Hier kommt der zu sprechende Text.'
TS=$(date +%s)
OUT=/workspace/agent/data/outbox/voice-${TS}.ogg
mkdir -p /workspace/agent/data/outbox

# JSON-Body sicher bauen (Sonderzeichen im Text korrekt escapen)
BODY="$(TEXT="$TEXT" python3 -c 'import json,os; print(json.dumps({"text": os.environ["TEXT"]}))')"

# Primär: TTS-OpenAI (Stimme onyx)
HTTP=$(curl -s -o "$OUT" -w "%{http_code}" \
  -X POST http://host.docker.internal:8385/synthesize \
  -H 'Content-Type: application/json' \
  --max-time 30 \
  -d "$BODY")

# Fallback: Piper bei 5xx
if [ "$HTTP" -ge 500 ] || [ ! -s "$OUT" ]; then
  rm -f "$OUT"
  curl -s -o "$OUT" -X POST http://host.docker.internal:8386/synthesize \
    -H 'Content-Type: application/json' --max-time 30 \
    -d "$BODY"
fi
```

## Versand via Telegram

Nutze das eingebaute `mcp__nanoclaw__send_file`-Tool mit dem OGG-Pfad. Telegram zeigt `audio/ogg`-Dokumente mit Play-Button als inline-abspielbare Audio-Nachricht.

```
mcp__nanoclaw__send_file({ path: "/workspace/agent/data/outbox/voice-<ts>.ogg", filename: "voice.ogg" })
```

**Aufräumen:** Nach erfolgreichem Versand die OGG-Datei löschen (`rm -f`), damit sich keine Reste in der outbox sammeln.

## Text-Vorbereitung

- Markdown-Sonderzeichen (`*`, `_`, `` ` ``) vor der TTS-Anfrage entfernen — sie werden sonst mitgesprochen.
- URLs durch eine kurze Beschreibung ersetzen (z.B. „Link zu Wikipedia" statt der vollen URL).
- Lange Listen oder Codeblöcke NICHT vorlesen — Voice-Mode ist für Fließtext-Antworten gedacht. Bei strukturierten Inhalten dem User mitteilen „Das ist als Text verständlicher" und nur Text schicken.
- Maximale Länge: ca. 800 Zeichen ist die sweet-spot — länger wird müde und teuer.

## Fehlerpfade

- **TTS-OpenAI 5xx:** automatischer Piper-Fallback (siehe oben).
- **Beide Endpoints offline:** Skill abbrechen, dem User mitteilen „Voice-Service offline, Antwort nur als Text".
- **Leere Datei:** Wenn `stat -c %s "$OUT"` 0 zurückgibt, war der Aufruf erfolglos — gleiche Fehlerbehandlung.

## Sicherheit

- Eingabetexte werden an die OpenAI-API weitergegeben (TTS-OpenAI Backend). Keine PII, keine Mandantendaten, keine vertraulichen Inhalte.
- Bei sensiblen Themen (z.B. MAV-interne Beratung) bewusst auf Piper umstellen oder gar keinen Voice-Output liefern.
