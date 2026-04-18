#!/bin/bash
set -e

# Git config for memex commits
git config --global user.name "OPJ1"
git config --global user.email "opj1@nanoclaw"
git config --global --add safe.directory /workspace/extra/memex
git config --global core.sharedRepository group

# Recompile agent-runner from (possibly updated) mounted source
cd /app && npx tsc --outDir /tmp/dist 2>&1 >&2 || true
ln -s /app/node_modules /tmp/dist/node_modules
chmod -R a-w /tmp/dist

# Read container input from stdin, run agent
cat > /tmp/input.json
node /tmp/dist/index.js < /tmp/input.json
