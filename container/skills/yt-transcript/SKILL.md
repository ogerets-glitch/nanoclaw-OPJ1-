---
name: yt-transcript
description: "YouTube-Video-Inhalte verstehen, transkribieren und zusammenfassen. IMMER nutzen, wenn Oliver einen YouTube-Link schickt und Inhalt/Transkript/Zusammenfassung/Analyse will. Primärweg: ScrapeCreators API holt die echten YouTube-Captions (vollständig, mit Zeitstempeln, kein Token-Limit). Fallback: Gemini API verarbeitet die Video-URL direkt — nur wenn das Video keine Captions hat. Trigger: youtube.com-URLs, youtu.be-URLs, 'fass das Video zusammen', 'transkribiere', 'was sagt der in dem Video', 'worum geht es'. Keine Fremdquellen-Rekonstruktion: wenn beide Wege nichts liefern, das ehrlich sagen statt zu konfabulieren."
allowed-tools: Bash(curl:*), Bash(python3:*), Bash(grep:*), Bash(cat:*), Bash(bash:*), Bash(rm:*), Read
---

# YouTube-Video-Inhalt holen

Zwei Wege, klare Reihenfolge:

1. **ScrapeCreators (Primärweg, immer zuerst).** Holt die echten YouTube-Auto-Captions als strukturierte Segmente — vollständig bis zum Videoende, mit Zeitstempeln, ohne Output-Token-Limit. Das ist der wörtliche Transkript-Text, den YouTube selbst vorhält; nichts wird vom Modell generiert, also gibt es kein Halluzinationsrisiko. Funktioniert vom VPS aus, weil ScrapeCreators als Proxy fungiert (die Hetzner-IP spielt keine Rolle).
2. **Gemini (Fallback, nur bei fehlenden Captions).** Wenn ScrapeCreators kein Transkript liefert (Video hat keine Auto-Captions — z. B. Captions vom Uploader deaktiviert oder Video frisch hochgeladen), verarbeitet Gemini die YouTube-URL direkt in Googles Netz. **Achtung Halluzinations-Failure-Mode bei langen Videos — siehe Abschnitt 4.**

**Warum diese Reihenfolge (wichtig, nicht umdrehen):** Gemini erfindet bei langen Videos (>~1 h) ein plausibles, aber **gefälschtes Outro**, statt ehrlich abzubrechen. Konkreter Vorfall 2026-06-22: ein 2h23-Video (`https://youtu.be/E1rfw2PR5MI`) wurde von Gemini nach ~60 Min mit komplett erfundener Verabschiedung „beendet" — sah vollständig aus, war es aber nicht. ScrapeCreators lieferte für dasselbe Video lückenlos 4163 Segmente bis 143:02. Deshalb ist ScrapeCreators der Primärweg für **jedes** Video, nicht nur für lange.

## Ablauf

### 1. Video-URL vorbereiten

Aus der Nachricht die YouTube-URL extrahieren (`https://www.youtube.com/watch?v=…` oder `https://youtu.be/…`). Die vollständige URL reicht — keine ID-Extraktion nötig.

### 2. Primärweg — ScrapeCreators-Transkript holen

Der Key kommt aus der Container-Env-Var `SCRAPECREATORS_API_KEY` (vom OneCLI-Gateway als Marker injiziert, vom Gateway-Proxy outbound durch den echten Vault-Wert ersetzt). Auth läuft über den **Header** `x-api-key` — **nicht** über einen URL-Parameter, weil der OneCLI-Gateway nur Header injizieren/überschreiben kann.

```bash
VIDEO_URL="<die-url-aus-olivers-nachricht>"

# URL sauber encodieren und als Query-Param ?url= übergeben
ENC_URL="$(VIDEO_URL="$VIDEO_URL" python3 -c 'import urllib.parse,os; print(urllib.parse.quote(os.environ["VIDEO_URL"], safe=""))')"
curl -sS "https://api.scrapecreators.com/v1/youtube/video/transcript?url=${ENC_URL}" \
  -H "x-api-key: $SCRAPECREATORS_API_KEY" \
  -H "Content-Type: application/json" > /tmp/sc-transcript.json
```

Antwort defensiv parsen und als formatiertes Transkript in eine Datei schreiben. **Das Format der `transcript`-Segmente kann variieren** (Liste von Segment-Objekten mit Zeitstempel-Feldern, Liste von Strings, oder ein einzelner Textblock) — das folgende Script fängt alle drei Fälle ab. **Kein Truncate** — Volltranskript bedeutet vollständig, egal wie lang:

```bash
python3 - <<'PY'
import json, sys

d = json.load(open("/tmp/sc-transcript.json"))

# 1. Erfolg / Fehler prüfen -> entscheidet über Gemini-Fallback
if d.get("success") is False or d.get("error"):
    print("SC_FALLBACK: success=false oder error -> Gemini-Fallback (Abschnitt 4)", file=sys.stderr)
    sys.exit(2)

segments = d.get("transcript")
if not segments:  # None oder [] -> Video hat keine Auto-Captions
    print("SC_NO_CAPTIONS: transcript leer -> Gemini-Fallback (Abschnitt 4)", file=sys.stderr)
    sys.exit(3)

def ts(seg):
    """Zeitstempel [MM:SS] aus einem Segment ziehen, defensiv. MM laeuft ueber 60 (z.B. 143:02)."""
    if isinstance(seg, dict):
        if seg.get("startTimeText"):
            return str(seg["startTimeText"])
        ms = seg.get("startMs") or seg.get("start") or seg.get("offset")
        if ms is not None:
            total = int(float(ms)) // 1000
            return f"{total // 60:02d}:{total % 60:02d}"
    return None

def text_of(seg):
    if isinstance(seg, dict):
        return (seg.get("text") or seg.get("snippet") or "").strip()
    return str(seg).strip()

lines = []
if isinstance(segments, list):
    for seg in segments:
        t = text_of(seg)
        if not t:
            continue
        stamp = ts(seg)
        lines.append(f"[{stamp}] {t}" if stamp else t)
else:  # einzelner Textblock
    lines = [str(segments).strip()]

lang = d.get("language") or "?"
credits = d.get("credits_remaining")
header = f"# YouTube-Transkript (ScrapeCreators) — Sprache: {lang}"
if credits is not None:
    header += f" — Credits übrig: {credits}"

with open("/tmp/transcript.txt", "w") as f:
    f.write(header + "\n\n" + "\n".join(lines) + "\n")

print(f"OK: {len(lines)} Zeilen geschrieben nach /tmp/transcript.txt (Sprache {lang}, Credits {credits})")
PY
```

Auswerten:

- **Exit 0:** Transkript liegt in `/tmp/transcript.txt`. Jetzt je nach Wunsch:
  - **Oliver will das Transkript / „wortgetreu":** Inhalt von `/tmp/transcript.txt` mit `Read` öffnen und an Oliver weiterreichen. Bei langen Transkripten übernimmt der Channel das Aufteilen (Chunking) automatisch — nichts kürzen.
  - **Oliver will eine Zusammenfassung/Analyse:** `/tmp/transcript.txt` mit `Read` selbst lesen und daraus die Zusammenfassung schreiben (Kernthese in 1–2 Sätzen, wichtigste Argumente mit Zeitstempeln, kurze Einordnung). **Kein zweiter API-Call nötig** — du hast den vollständigen Wortlaut im Kontext, deshalb entsteht hier auch keine Halluzination wie beim Gemini-Direktweg.
- **Exit 2 oder 3:** Kein verwertbares Transkript → weiter mit dem **Gemini-Fallback (Abschnitt 4)**.

Aufräumen, wenn fertig: `rm -f /tmp/sc-transcript.json /tmp/transcript.txt`

**Sprecher-Hinweis (wichtig):** YouTube-Auto-Captions kennen **keine** Sprecher-Trennung — das Transkript ist ein durchgehender Textstrom ohne „A:"/„B:". Wenn Oliver Sprecher-Zuordnung will, ist das eine zweite Stufe (Gemini gezielt für eine konkrete Stelle fragen oder ein Speaker-Diarization-Tool) — nicht aus dem Auto-Caption-Transkript erfindbar.

### 3. ScrapeCreators-Fehlertabelle

| Symptom (SC) | Was es bedeutet | Aktion |
|---|---|---|
| `success: false` oder HTTP 4xx | Key ungültig / Video-URL kaputt | Key-Verfügbarkeit prüfen (`$SCRAPECREATORS_API_KEY` gesetzt?), URL validieren, dann Gemini-Fallback (Abschnitt 4) |
| `success: true` + `transcript: []` | Video hat keine Auto-Captions | Gemini-Fallback (Abschnitt 4) |
| `success: true` + `transcript: null` | Video privat / nicht abrufbar | Oliver informieren — kein Fallback sinnvoll, Gemini scheitert an privaten Videos ebenfalls |
| `credits_remaining: 0` oder sehr niedrig | ScrapeCreators-Budget aufgebraucht | Oliver warnen („ScrapeCreators-Credits fast/ganz leer"), dann Gemini-Fallback |
| Network-Timeout / curl exit ≠ 0 | Transientes Problem | 1× retry, dann Gemini-Fallback |

### 4. Fallback — Gemini API (nur wenn ScrapeCreators keine Captions liefert)

> ⚠️ **Halluzinations-Failure-Mode — der Grund, warum Gemini nur Fallback ist:**
> Bei langen Videos reicht Geminis Output-Limit (`maxOutputTokens`, max ~65k, praktisch ~30k ≈ 60 Min Video-Stoff) nicht für ein Volltranskript. Gemini meldet dann **nicht** sauber „abgeschnitten" (`FINISH=MAX_TOKENS`), sondern erzeugt einen **plausibel klingenden, frei erfundenen Schluss** (`FINISH=STOP`) — inkl. Verabschiedung und Outro. Das ist schlimmer als ein hartes Abbrechen, weil das Ergebnis vollständig aussieht.
> **Konsequenz für die Nutzung:** Den Gemini-Fallback nur für **Zusammenfassungen** oder für **kurze** Videos einsetzen. Verlange Oliver ein **Volltranskript** und ScrapeCreators hat versagt, dann ehrlich sagen: „Vollständiges wörtliches Transkript ist für dieses Video nicht zugänglich (keine Auto-Captions, Gemini kann lange Videos nicht zuverlässig wörtlich transkribieren)." Niemals einen Gemini-„Transkript"-Output als vollständig ausgeben, ohne die Länge gegen die Video-Dauer zu prüfen.

Der Key wird primär aus der Container-Env-Var gelesen (OneCLI-Gateway-Pfad), Legacy-Fallback auf den alten Skill-Config-Pfad. Auth über `x-goog-api-key`-Header — **nicht** über `?key=`, weil der OneCLI-Gateway nur Header überschreiben kann.

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

Wenn `$TEXT` gefüllt ist: bei einer Zusammenfassung direkt an Oliver weiterreichen. Bei einer Transkript-Anfrage zuerst den Halluzinations-Warnhinweis oben beachten.

Temp-Datei aufräumen: `rm -f /tmp/gemini-response.json`

#### Gemini-Fehlertabelle

| Symptom | Was es bedeutet | Aktion |
|---|---|---|
| `error.code == 400` oder `403` und `error.message` enthält `private`, `unlisted`, `not publicly available` oder `UNAVAILABLE` | Video ist nicht öffentlich gelistet (privat oder unlisted). Gemini nutzt Googles internen Content-Index, der nur public Videos kennt. | **Kein funktionaler Alternativweg vom VPS** (Browser-Fallback vom VPS-Subnetz ebenfalls tot, siehe unten). Oliver informieren: „Video ist nicht öffentlich gelistet — Gemini verarbeitet nur public Videos. Du kannst (a) das Video kurz auf ‚Öffentlich' stellen, Transkript holen, zurück auf ‚Ungelistet', oder (b) mir den Inhalt in eigenen Worten schicken, oder (c) das Transkript lokal auf deinem Laptop holen." |
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

Gleiche Ursache wie bei yt-dlp: Hetzner-Subnetz ist bei YouTube auf der Block-Liste für Caption-Assets. Nicht lösbar vom VPS aus über den direkten Weg. **ScrapeCreators umgeht genau das**, weil die Caption-Abfrage über deren Proxy-Infrastruktur läuft, nicht über die Hetzner-IP — deshalb ist SC der Primärweg und nicht der direkte CDN-Zugriff.

**Artefakte bleiben im Repo als dokumentierte Sackgasse** (damit die Erkenntnis nicht verlorengeht und nicht versehentlich erneut aufgebaut wird):

- `browser-fetch.sh` — Fallback-Wrapper mit Cookie-State-Injection
- `parse-captions.py` — Caption-Track-JSON-Parser (Sprach-Präferenz de/en)
- Cookie-Mount `/workspace/extra/youtube-cookies.txt` + yt-dlp + Deno im Image

**Nicht aufrufen**, auch nicht probeweise — verbrennt nur Laufzeit. Der tragende Weg ist ScrapeCreators (Abschnitt 2), bei fehlenden Captions Gemini (Abschnitt 4).

## Guardrail

Wenn weder ScrapeCreators noch Gemini Inhalt liefern:

- **Nicht** rekonstruieren aus Websuche, oEmbed-Description, GitHub-Repo des Autors oder ähnlichen Fremdquellen.
- Oliver sagen: „Kein Video-Inhalt zugänglich" plus erkennbaren Grund.
- Titel/Description aus oEmbed (`curl "https://www.youtube.com/oembed?url=<URL>&format=json"`) dürfen als **Metadaten** ergänzt werden — niemals als Video-Inhalt verkaufen.

Ebenso gilt: Ein über den Gemini-Fallback geholtes „Transkript" eines langen Videos **niemals** als vollständig ausgeben, ohne die Länge gegen die Video-Dauer zu prüfen (Halluzinations-Failure-Mode, Abschnitt 4).

Diese Regeln existieren, weil in der Vergangenheit aus Metadaten + Websuche bzw. aus abgeschnittenem Gemini-Output Inhalte „rekonstruiert" wurden, die plausibel klangen, aber nicht das waren, was tatsächlich im Video gesagt wurde. Das ist Konfabulation und schadet dem Vertrauen.

## Wann NICHT diesen Skill nutzen

- Wenn Oliver den YouTube-Link nur beiläufig erwähnt und keine Zusammenfassung will → keinen Skill starten.
- Für YouTube-Kanal-Übersichten oder Trending-Content der letzten Tage → `last30days`-Skill.
- Für Video-Download zur Archivierung → separate Aufgabe, dieser Skill liefert nur Inhalt.
