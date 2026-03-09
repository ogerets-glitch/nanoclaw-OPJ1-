#!/bin/bash
# start-nanoclaw.sh — Start NanoClaw without systemd
# To stop: kill \$(cat /home/opj1claw/nanoclaw/nanoclaw.pid)

set -euo pipefail

cd "/home/opj1claw/nanoclaw"

# Stop existing instance if running
if [ -f "/home/opj1claw/nanoclaw/nanoclaw.pid" ]; then
  OLD_PID=$(cat "/home/opj1claw/nanoclaw/nanoclaw.pid" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping existing NanoClaw (PID $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 2
  fi
fi

echo "Starting NanoClaw..."
nohup "/usr/bin/node" "/home/opj1claw/nanoclaw/dist/index.js" \
  >> "/home/opj1claw/nanoclaw/logs/nanoclaw.log" \
  2>> "/home/opj1claw/nanoclaw/logs/nanoclaw.error.log" &

echo $! > "/home/opj1claw/nanoclaw/nanoclaw.pid"
echo "NanoClaw started (PID $!)"
echo "Logs: tail -f /home/opj1claw/nanoclaw/logs/nanoclaw.log"
