#!/usr/bin/env bash
# Best-effort: export Telegram-conversation messages from OPJ1 Claude session
# JSONLs into a single Markdown archive.
#
# Filter: queue-operation enqueue events whose <message> tag has sender="Oliver"
# (Telegram-Bot-API resolves Oliver's Telegram first_name as the sender).
#
# Usage: bash scripts/export-telegram-archive.sh > /path/to/archive.md
set -eo pipefail

SESS_ROOT="data/v2-sessions/ag-1777053973937-w5v230/.claude-shared"

cat <<EOF
# Telegram-Archiv OPJ1 (@MontjoieOG77_bot)

**Exportiert:** $(date -Iseconds)
**Quelle:** $SESS_ROOT/{projects,backups}/**/*.jsonl
**Filter:** \`sender="Oliver"\` (Telegram-Display-Name) in queue-enqueue-Events
**Hinweis:** Enthaelt die User-Eingaben aus Telegram inkl. dem von NanoClaw
serialisierten Kontext (timezone, message-tags). Assistant-Antworten sind im
Container-State und nicht im Archiv.

EOF

# jq handles the entire pipeline: filter → sort → format. -s slurps all input
# into one array so sort_by works across files; -r emits plain text.
find "$SESS_ROOT" -type f -name '*.jsonl' -print0 2>/dev/null \
| xargs -0 cat 2>/dev/null \
| jq -rs '
    [.[] | select(.type=="queue-operation"
                   and .operation=="enqueue"
                   and (.content // "" | contains("sender=\"Oliver\"")))]
    | unique_by([.timestamp, .content])
    | sort_by(.timestamp)
    | .[]
    | "## \(.timestamp)\n\n_Session: \(.sessionId)_\n\n\(.content)\n\n---\n"
  '
