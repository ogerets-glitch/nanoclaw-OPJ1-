#!/usr/bin/env bash
# browser-fetch.sh — Fallback für yt-transcript (private/unlisted Videos).
#
# Plan-B-Ansatz: Playwright-Auth-State wird BEIM Browser-Launch injiziert,
# nicht nachträglich. agent-browser unterstützt dafür --state <json>.
# State enthält Cookies + Storage — wir bauen ihn aus der Netscape-Cookie-Datei.
#
# Schreibt Caption-Plaintext auf stdout. Fehlermarker auf stderr:
# COOKIE_PARSE_FAIL, LOGIN_REQUIRED, NO_CAPTIONS, BROWSER_FAIL.
#
# Aufruf: browser-fetch.sh <youtube-url>

set -u

VIDEO_URL="${1:-}"
if [[ -z "$VIDEO_URL" ]]; then
  echo "BROWSER_FAIL: missing video URL argument" >&2
  exit 2
fi

COOKIE_FILE="/workspace/extra/youtube-cookies.txt"
STATE_FILE="$(mktemp -t yt-state.XXXXXX.json)"

cleanup() {
  rm -f "$STATE_FILE"
  agent-browser close >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ ! -r "$COOKIE_FILE" ]]; then
  echo "COOKIE_PARSE_FAIL: $COOKIE_FILE nicht lesbar" >&2
  exit 1
fi

# 1. Netscape-Cookies → Playwright Auth-State JSON
#    Netscape-Format (tab-separated): domain flag path secure expiry name value
#    #HttpOnly_<domain>-Präfix markiert httpOnly-Cookies, andere #-Zeilen = Kommentar.
python3 - "$COOKIE_FILE" "$STATE_FILE" <<'PYEOF'
import json, re, sys

cookie_file, state_file = sys.argv[1], sys.argv[2]
cookies = []
with open(cookie_file, "r", encoding="utf-8") as fh:
    for raw in fh:
        line = raw.rstrip("\n")
        if not line:
            continue
        http_only = False
        if line.startswith("#HttpOnly_"):
            line = line[len("#HttpOnly_"):]
            http_only = True
        elif line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 7:
            continue
        domain, _flag, path, secure, expiry, name, value = parts[:7]
        if not re.search(r"(youtube\.com|youtu\.be|google\.com|ytimg\.com)$", domain):
            continue
        try:
            expires = int(expiry)
        except ValueError:
            expires = -1
        cookies.append({
            "name": name,
            "value": value,
            "domain": domain,
            "path": path,
            "secure": secure == "TRUE",
            "httpOnly": http_only,
            "sameSite": "None" if secure == "TRUE" else "Lax",
            "expires": expires if expires > 0 else -1,
        })

if not cookies:
    print("COOKIE_PARSE_FAIL: keine YouTube-Cookies im File", file=sys.stderr)
    sys.exit(1)

with open(state_file, "w", encoding="utf-8") as fh:
    json.dump({"cookies": cookies, "origins": []}, fh)

print(f"OK: {len(cookies)} cookies staged", file=sys.stderr)
PYEOF

if [[ $? -ne 0 ]]; then
  # Python hat bereits COOKIE_PARSE_FAIL ausgegeben
  exit 1
fi

# 2. Browser mit State starten und Video-URL öffnen — State wird
#    beim Context-Init gesetzt, bevor irgendeine Navigation stattfindet.
if ! agent-browser --state "$STATE_FILE" open "$VIDEO_URL" >/dev/null 2>&1; then
  echo "BROWSER_FAIL: konnte Video-URL mit State nicht öffnen" >&2
  exit 1
fi

agent-browser wait --load networkidle >/dev/null 2>&1 || true

# 3. Login-Check
current_url="$(agent-browser get url 2>/dev/null || echo '')"
page_title="$(agent-browser get title 2>/dev/null || echo '')"
if [[ "$current_url" == *"accounts.google.com"* || "$current_url" == *"/signin"* || \
      "$page_title" == *"Sign in"* || "$page_title" == *"Anmelden"* ]]; then
  echo "LOGIN_REQUIRED: Cookies entwertet oder 2FA nötig" >&2
  exit 1
fi

# 4. ytInitialPlayerResponse auslesen — in Tempfile schreiben (kein Quoting-Problem)
CAPTIONS_TMP="$(mktemp -t yt-captions.XXXXXX.json)"
agent-browser eval \
  'JSON.stringify(window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [])' \
  2>/dev/null > "$CAPTIONS_TMP"

# 5. baseUrl wählen: de -> en -> erste verfügbare (Python3, liest aus Tempfile)
base_url="$(python3 /home/node/.claude/skills/yt-transcript/parse-captions.py "$CAPTIONS_TMP" 2>/tmp/yt-parse-err.txt)"
PY_EXIT=$?
rm -f "$CAPTIONS_TMP"

if [[ $PY_EXIT -eq 2 ]]; then
  echo "NO_CAPTIONS: Video hat keine Untertitel (auch keine auto-generierten)" >&2
  exit 1
fi
if [[ $PY_EXIT -ne 0 || -z "$base_url" ]]; then
  echo "NO_CAPTIONS: Captions-Parsing fehlgeschlagen ($(cat /tmp/yt-parse-err.txt 2>/dev/null))" >&2
  exit 1
fi

# 6. VTT herunterladen
vtt="$(curl -sS --max-time 15 "${base_url}&fmt=vtt" 2>/dev/null)"
if [[ -z "$vtt" ]]; then
  echo "NO_CAPTIONS: VTT-Download fehlgeschlagen" >&2
  exit 1
fi

# 7. VTT → Plaintext (Header, Cues, Tags, HTML-Entities, Duplikate raus)
echo "$vtt" | awk '
  BEGIN { last="" }
  /^WEBVTT/ {next}
  /^NOTE/ {next}
  /-->/ {next}
  /^[[:space:]]*$/ {next}
  /^[0-9]+$/ {next}
  {
    gsub(/<[^>]*>/, "")
    gsub(/&amp;/, "\\&")
    gsub(/&lt;/, "<")
    gsub(/&gt;/, ">")
    gsub(/&quot;/, "\"")
    gsub(/&#39;/, "'\''")
    gsub(/^[[:space:]]+|[[:space:]]+$/, "")
    if ($0 != "" && $0 != last) { print; last=$0 }
  }
'
