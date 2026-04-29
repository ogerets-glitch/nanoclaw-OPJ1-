---
name: yt-transcript
description: "YouTube-Video-Inhalte verstehen und zusammenfassen. IMMER nutzen, wenn Oliver einen YouTube-Link schickt und eine Zusammenfassung/Analyse/Einordnung des Inhalts will. Weg: Gemini API — sie verarbeitet die YouTube-URL intern, Hetzner-IP irrelevant. Trigger: youtube.com-URLs, youtu.be-URLs, 'fass das Video zusammen', 'was sagt der in dem Video', 'worum geht es'. Keine Fremdquellen-Rekonstruktion: wenn Gemini nichts liefert, das ehrlich sagen statt zu konfabulieren."
allowed-tools: Bash(curl:*), Bash(python3:*), Bash(grep:*), Bash(cat:*), Bash(bash:*), Bash(rm:*), Read
---

# YouTube-Video-Inhalt holen

Hetzner-Datacenter-IPs sind bei YouTube auf Bot-Blacklist — yt-dlp funktioniert nur für wenige Whitelist-Videos, und der Timedtext-Caption-Endpoint wird pauschal auf CDN-Ebene gefiltert (siehe „Warum kein Browser-Fallback" unten). **Einziger tragender Weg: Gemini API.** Google verarbeitet die YouTube-URL intern in seinem eigenen Netz, die Hetzner-IP spielt dort keine Rolle. Free-Tier-Kontingent: 8 h Video/Tag pro Modell.

## Ablauf

### 1. Video-URL vorbereiten

Aus der Nachricht die YouTube-URL extrahieren (`https://www.youtube.com/watch?v=…` oder `https://youtu.be/…`). Die vollständige URL reicht — keine ID-Extraktion nötig.

### 2. Gemini-Aufruf mit Model-Fallback-Kette

Der Key wird primär aus der Container-Env-Var (vom OneCLI-Gateway als Marker injiziert, vom Gateway-Proxy outbound durch den echten Vault-Wert ersetzt). Falls leer, Legacy-Fallback auf den alten Skill-Config-Pfad. Auth läuft über den `x-goog-api-key`-Header — **nicht** über den URL-Parameter `?key=`, weil der OneCLI-Gateway Header injizieren/überschreiben kann, aber keine URL-Parameter.

```bash
# Primär Container-Env-Var (OneCLI-Gateway-Pfad). Legacy-Fallback auf Config-Datei.
if [[ -z "$GEMINI_API_KEY" ]]; then
  GEMINI_API_KEY="$(grep '^GEMINI_API_KEY=' /workspace/global/config/last30days/.env 2>/dev/null | cut -d= -f2-)"
fi

VIDEO_URL="<die-url-aus-olivers-nachricht>"
PROMPT="Fasse dieses Video strukturiert auf Deutsch zusammen: Kernthese in 1–2 Sätzen, danach die wichtigsten Argumente mit Zeitstempeln (MM:SS), zum Schluss eine kurze Einordnung (Tonlage, Belastbarkeit, was fehlt). Keine Floskeln."

# Model-Reihenfolge: 2.5-flash (default) → flash-latest (Alias, separates Kapazitäts-Pool) → 2.5-flash-lite
# Bei 503/429: nach Reihenfolge durchprobieren, jeweils 1× pro Modell.
MODELS=("gemini-2.5-flash" "gemini-flash-latest" "gemini-2.5-flash-lite")
for MODEL in "${MODELS[@]}"; do
  BODY="$(VIDEO_URL="$VIDEO_URL" PROMPT="$PROMPT" python3 -c '
import json, os
print(json.dumps({
  "contents": [{"parts": [
    {"file_data": {"file_uri": os.environ["VIDEO_URL"]}},
    {"text": os.environ["PROMPT"]},
  ]}]
}))')"
  curl -sS -X POST \
    "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent" \
    -H "Content-Type: application/json" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    -d "$BODY" > /tmp/gemini-response.json
  ERR_CODE_TEST="$(python3 -c 'import json; d=json.load(open("/tmp/gemini-response.json")); print(d.get("error",{}).get("code","") or "")' 2>/dev/null)"
  if [[ "$ERR_CODE_TEST" != "503" && "$ERR_CODE_TEST" != "429" ]]; then break; fi
done
```

Response verarbeiten:

```bash
TEXT="$(python3 -c 'import json
d=json.load(open("/tmp/gemini-response.json"))
try: print(d["candidates"][0]["content"]["parts"][0].get("text","") or "")
except Exception: print("")' 2>/dev/null)"
ERR_CODE="$(python3 -c 'import json
d=json.load(open("/tmp/gemini-response.json"))
print(d.get("error",{}).get("code","") or "")' 2>/dev/null)"
ERR_MSG="$(python3 -c 'import json
d=json.load(open("/tmp/gemini-response.json"))
print(d.get("error",{}).get("message","") or "")' 2>/dev/null)"
```

Wenn `$TEXT` gefüllt ist: direkt an Oliver weiterreichen.

**Prompt-Variante** wenn Oliver explizit „Transkript" oder „wortgetreu" verlangt:

```
PROMPT="Transkribiere dieses Video möglichst wortgetreu auf Deutsch (bei fremdsprachigem Video die Originalsprache behalten und die deutsche Übersetzung darunter). Keine Zusammenfassung, keine Kürzungen."
```

Temp-Datei aufräumen: `rm -f /tmp/gemini-response.json`

### 3. Fehlertabelle

| Symptom | Was es bedeutet | Aktion |
|---|---|---|
| `error.code == 400` oder `403` und `error.message` enthält `private`, `unlisted`, `not publicly available` oder `UNAVAILABLE` | Video ist nicht öffentlich gelistet (privat oder unlisted). Gemini nutzt Googles internen Content-Index, der nur public Videos kennt — selbst bei unlisted Videos, die per Link erreichbar wären, verweigert die API. | **Kein funktionaler Alternativweg vom VPS** (Browser-Fallback vom VPS-Subnetz ebenfalls tot, siehe unten). Oliver informieren: „Video ist nicht öffentlich gelistet — Gemini verarbeitet nur public Videos. Du kannst (a) das Video kurz auf ‚Öffentlich' stellen, Transkript holen, zurück auf ‚Ungelistet', oder (b) mir den Inhalt in eigenen Worten schicken, oder (c) das Transkript lokal auf deinem Laptop holen." |
| `error.code == 400` und `error.message` enthält `8 hour`, `duration`, `too long` | Free-Tier-Limit, Video zu lang | Oliver informieren: „Gemini-Kontingent für heute aufgebraucht oder Video über 8 h, morgen nochmal." |
| `error.code == 403` / `PERMISSION_DENIED` **ohne** `private`/`unlisted`-Marker | Key ungültig oder abgelaufen | An Claude Code (VPS) eskalieren — Oliver sagen: „Gemini-Key scheint ungültig, bitte bei Claude Code melden." |
| `error.code == 429` / `RESOURCE_EXHAUSTED` | Rate-Limit erreicht | 30 s warten, **1× retry** mit gleichem Modell; wenn wieder 429 → nächstes Modell in der Kette |
| `error.code == 503` / HTTP 503 / `UNAVAILABLE` ohne „private"-Marker | Gemini-Kapazitätsengpass (transient, v. a. abends US-Zeit) | Model-Kette durchprobieren (ist oben in der Schleife schon so). Wenn alle drei 503 → Oliver informieren: „Gemini-Region insgesamt überlastet, in 30–60 min nochmal." |
| `error.code == 500` / sonstiger 5xx-Error | Gemini-Serverfehler | 30 s warten, 1× retry mit gleichem Modell; bei erneutem Fehler Oliver informieren |
| `candidates`-Array leer, kein `error` | Safety-Block (Content-Policy) | Ehrlich melden: „Gemini hat die Video-Verarbeitung verweigert (Content-Filter)." |
| Network-Timeout / curl exit ≠ 0 | Transientes Problem | 1× retry, dann aufgeben |

## Warum kein Browser-Fallback vom VPS funktioniert

Historischer Fallback-Versuch: Headless-Chromium im Container mit injizierten YouTube-Cookies (Netscape-Format → Playwright-Auth-State) via `agent-browser --state <json>`, dann Caption-URL aus `ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks[0].baseUrl` extrahieren und via `curl` abrufen.

**Getestet am 23.04.2026, Ergebnis:**

- ✅ State-Injection funktioniert
- ✅ Login klappt (YouTube-Seite rendert als eingeloggter User)
- ✅ Caption-Tracks werden in `ytInitialPlayerResponse` gefunden
- ❌ **VTT-Download vom `timedtext`-Endpoint liefert HTTP 200 mit 0 Bytes und `Content-Type: text/html`** — YouTube filtert Hetzner-Datacenter-IPs auf Caption-CDN-Ebene separat vom Watch-Page-Zugriff.

Gleiche Ursache wie bei yt-dlp: Hetzner-Subnetz ist bei YouTube auf der Block-Liste für Caption-Assets. Nicht lösbar vom VPS aus; ein Residential-Proxy würde es umgehen (eigene Baustelle, nicht Teil dieses Skills).

**Artefakte bleiben im Repo als dokumentierte Sackgasse** (damit die Erkenntnis nicht verlorengeht und nicht versehentlich erneut aufgebaut wird):

- `browser-fetch.sh` — Fallback-Wrapper mit Cookie-State-Injection
- `parse-captions.py` — Caption-Track-JSON-Parser (Sprach-Präferenz de/en)
- Cookie-Mount `/workspace/extra/youtube-cookies.txt` + yt-dlp + Deno im Image

**Nicht aufrufen**, auch nicht probeweise — verbrennt nur Laufzeit. Wenn Gemini an einem Video scheitert, Oliver die Fehlertabelle-Antwort geben und fertig.

## Guardrail

Wenn Gemini keinen Inhalt liefert:

- **Nicht** rekonstruieren aus Websuche, oEmbed-Description, GitHub-Repo des Autors oder ähnlichen Fremdquellen.
- Oliver sagen: „Kein Video-Inhalt zugänglich" plus erkennbaren Grund.
- Titel/Description aus oEmbed (`curl "https://www.youtube.com/oembed?url=<URL>&format=json"`) dürfen als **Metadaten** ergänzt werden — niemals als Video-Inhalt verkaufen.

Diese Regel existiert, weil in der Vergangenheit aus Metadaten + Websuche Inhalte „rekonstruiert" wurden, die plausibel klangen aber nicht das waren, was tatsächlich im Video gesagt wurde. Das ist Konfabulation und schadet dem Vertrauen.

## Wann NICHT diesen Skill nutzen

- Wenn Oliver den YouTube-Link nur beiläufig erwähnt und keine Zusammenfassung will → keinen Skill starten.
- Für YouTube-Kanal-Übersichten oder Trending-Content der letzten Tage → `last30days`-Skill.
- Für Video-Download zur Archivierung → separate Aufgabe, dieser Skill liefert nur Inhalt.
