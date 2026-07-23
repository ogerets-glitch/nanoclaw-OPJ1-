---
name: local-services
description: "Inventar des zentralen Speech-to-Text-Dienstes auf dem VPS. Nutze diese Referenz für eingehende Sprachnachrichten, STT-Diagnose und Providerstatus. Sprachausgabe/TTS ist bewusst deaktiviert; Agentenantworten erfolgen ausschließlich als Text."
allowed-tools: Bash(curl:*)
---

# Lokaler Speech-to-Text-Adapter

Der zentrale STT-Dienst läuft direkt auf dem VPS-Host und ist aus dem
NanoClaw-Container über `host.docker.internal` erreichbar.

## STT (Speech-to-Text)

| Dienst | Endpoint | Routing | Healthcheck |
|---|---|---|---|
| **Cloud STT Adapter** | `http://host.docker.internal:8384/transcribe` | Infomaniak primär, OpenAI-Fallback | `GET /health` |

**Request:** `POST` als `multipart/form-data` mit `file=@audio.ogg` und optional
`language=de`.

**Erfolgsantwort:**

```json
{"text": "<transkript>", "language": "de", "duration": 1.234}
```

Der Response-Header `X-STT-Backend` nennt `infomaniak` oder `openai`.
Es gibt kein lokales Whisper-Modell und keinen lokalen Transkriptions-Fallback.

## TTS / Sprachausgabe

TTS ist auf diesem System bewusst deaktiviert. Die früheren Endpoints auf den
Ports 8385, 8386 und 8387 stehen nicht zur Verfügung. Agentenantworten immer als
Text senden und keine Voice-Ausgabe, Audiodatei oder TTS-Fallback versuchen.

## Diagnose

```bash
curl -s --max-time 5 http://host.docker.internal:8384/health
```

Ein gesunder Dienst meldet `ok: true` und die nichtgeheimen Readiness-Flags
`infomaniak_ready` und `openai_ready`. Bei einem STT-Fehler höflich um eine
Textnachricht bitten; niemals ein Transkript erfinden.

## Sicherheit

Der Dienst ist ohne eigene Client-Authentifizierung und nur für die vorgesehenen
internen Netze freigegeben. Audio nur verarbeiten, wenn es im Bot-Kontext ohnehin
vom Nutzer übermittelt wurde. Health- und Fehlerausgaben enthalten keine
Provider-Schlüssel.
