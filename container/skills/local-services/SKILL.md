---
name: local-services
description: "Inventar der lokalen Voice- und Audio-Dienste auf dem VPS-Host (TTS, STT, Piper-Fallback). Nutze als Referenz, wenn andere Skills (z.B. tts) die Endpoints brauchen, oder wenn der User fragt 'welche lokalen Dienste laufen' oder 'was ist auf dem Host installiert'."
allowed-tools: Bash(curl:*)
---

# Lokale Services (Host-seitig)

Diese Dienste laufen direkt auf dem VPS-Host und sind aus dem NanoClaw-Container über `host.docker.internal` erreichbar (Container-Bridge → Host-Loopback).

## TTS (Text-to-Speech)

| Service | Endpoint | Stimme | Qualität | Healthcheck |
|---|---|---|---|---|
| **TTS-OpenAI** (primär) | `http://host.docker.internal:8385/synthesize` | onyx (default) | sehr hoch | `GET /health` |
| **Piper** (Fallback) | `http://host.docker.internal:8386/synthesize` | de_DE-thorsten-high | mittel-hoch, lokal/kostenlos | `GET /health` |

**Request-Schema (beide):** `POST {"text": "<deutsch>"}` → Response: `audio/ogg` (OPUS-codec, ca. 32 kbps).

**Wann welcher Dienst?**
- Default: **TTS-OpenAI** — bessere Stimme, bezahlt aus dem OpenAI-Kontingent.
- Bei 5xx von TTS-OpenAI (Quota, Outage): automatischer Fallback auf Piper. Piper läuft lokal, immer verfügbar, keine externe API-Abhängigkeit.

## STT (Speech-to-Text)

| Service | Endpoint | Modell | Healthcheck |
|---|---|---|---|
| **Whisper** | `http://host.docker.internal:8384/transcribe` | faster-whisper small int8, lokal | (kein eigener Endpoint) |

**Request-Schema:** `POST` als `multipart/form-data` mit Feld `file=@audio.ogg` und optional `language=de` → Response: `{"text": "<transkript>"}`.

## Sicherheits-Hinweis

TTS-OpenAI (8385) und Piper (8386) binden auf `127.0.0.1`, Whisper (8384) bindet auf `0.0.0.0` und ist nur durch UFW-Regel auf den Docker-Bridge-Range `172.17.0.0/16` begrenzt. Alle drei Dienste sind ohne Auth und ohne TLS — kein externer Zugang. **Keine personenbezogenen Daten in Eingabe-Texten** (TTS) oder Audio-Dateien (STT) verarbeiten, die nicht ohnehin im Bot-Kontext stehen.

## Diagnose

```bash
curl -s http://host.docker.internal:8385/health
curl -s http://host.docker.internal:8386/health
curl -s --max-time 3 http://host.docker.internal:8384/openapi.json | head -c 200
```

Wenn ein Endpoint timeoutet oder nicht antwortet, ist der zugehörige systemd-Service auf dem Host wahrscheinlich gestoppt — der User muss das auf dem Host-Shell prüfen (`systemctl status tts-openai piper-tts whisper-stt`).
