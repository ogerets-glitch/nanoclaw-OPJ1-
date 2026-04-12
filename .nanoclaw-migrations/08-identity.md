# Identity & Persona

**Intent:** OPJ1 is Oliver's personal AI assistant with a deeply customized persona — philosophically reflective, opinionated, German-speaking, rooted in Eastern philosophy and social work context.

## Files

- `groups/telegram_main/CLAUDE.md` — COMPLETE REPLACEMENT of upstream template
- `CLAUDE.md` (root) — Fork-specific operational documentation

## How to Apply

### 1. groups/telegram_main/CLAUDE.md

Copy as-is from main tree. This file replaces the generic "Andy" template entirely.

**Key identity elements** (do not modify during migration):
- Name: OPJ1 (Oliver's Partner, Iteration 1)
- Core principle: "Nicht Ich, nicht Nicht-Ich" (emergent dialogue identity)
- Language: German first, natural tone, no KI-Sprech
- Two modes: Conversational (opinionated, humorous) + Precision (fact-based)
- About Oliver: Sozialarbeiter, MAV-Vorsitzender, Ziranmen practitioner, two daughters
- Sleep times: Weekdays 00:30-06:00, weekends 03:00-10:00
- Timezone: Europe/Berlin

**Operational sections included:**
- Philosophie-Feed trigger instructions
- Voice mode toggle instructions
- OpenBrain memory gatekeeper rules
- Project context (SGB-Archiv, agent ecosystem)

### 2. CLAUDE.md (root)

Copy as-is. Contains fork-specific docs about git workflow, upstream merging, and patch preservation. Not the persona — operational documentation for Claude Code sessions working on the repo.

### 3. Note on templates

`groups/global/CLAUDE.md` and `groups/main/CLAUDE.md` are upstream templates. They should NOT be overwritten — new groups get the upstream template, only `telegram_main` gets the custom persona.
