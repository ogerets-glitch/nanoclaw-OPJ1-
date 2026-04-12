# Applied Skills

## Upstream Skill Branches

Only one upstream skill branch was merged:

- **skill/compact** — Context compaction via `/compact` command
  - Merge commit: `d44965d`
  - Branch: `upstream/skill/compact`
  - Re-merge on upgrade: `git merge upstream/skill/compact --no-edit`

## Custom Skills (user-created, not from upstream)

Copy these directories as-is from the main tree:

### Host-side skills (`.claude/skills/`)

- `philosophie-feed/` — Daily philosophy reading (Daodejing, I Ching, Liezi)
- `memex/` — Memex personal wiki integration

All other skills in `.claude/skills/` are upstream-provided and will be present after checkout.

### Container-side skills (`container/skills/`)

- `calendar/` — Google Calendar iCal read access (SKILL.md + calendar.mjs)
- `pdf-reader/` — PDF text extraction with layout preservation (SKILL.md + binary)
- `philosophie-feed/` — Container version with academic framing for content filters

## Skill Interactions

No known conflicts between skills. The compact skill modifies `container/agent-runner/src/index.ts` which is also modified by the image/voice/model customizations — see section 5 (Container) for resolution order.
