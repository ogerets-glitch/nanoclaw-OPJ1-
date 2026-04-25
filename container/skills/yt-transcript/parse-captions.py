#!/usr/bin/env python3
import json, sys
path = sys.argv[1]
raw = open(path).read().strip()
try:
    parsed = json.loads(raw)
    if isinstance(parsed, str):
        parsed = json.loads(parsed)
except Exception as e:
    print(f"PARSE_ERR: {e}", file=sys.stderr)
    sys.exit(1)
if not parsed:
    sys.exit(2)
preferred = (
    [t for t in parsed if t.get("languageCode", "").startswith("de")] +
    [t for t in parsed if t.get("languageCode", "").startswith("en")] +
    parsed
)
if preferred:
    print(preferred[0].get("baseUrl", ""))
else:
    sys.exit(2)
