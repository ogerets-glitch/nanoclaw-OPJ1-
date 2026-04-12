# NanoClaw Migration Guide — OPJ1 Fork

Generated: 2026-04-12
Base: 934f063aff5c30e7b49ce58b53b41901d3472a3e
HEAD at generation: a078e7ee54c480f2ac7fc0607fac10075191b052
Upstream: 934f063aff5c30e7b49ce58b53b41901d3472a3e (v1.2.52)

## Sections

1. [Applied Skills](01-skills.md) — Upstream skill branches to re-merge
2. [Telegram Channel](02-telegram.md) — Full grammy-based Telegram implementation
3. [Image & Vision](03-image-vision.md) — Photo download, processing, multimodal prompts
4. [Voice & Audio](04-voice-audio.md) — Whisper STT, Piper TTS, voice mode
5. [Container & Credentials](05-container.md) — Credential fallback, env vars, Dockerfile, agent-runner
6. [Session Commands](06-session-commands.md) — /compact orchestration
7. [Circuit Breaker](07-circuit-breaker.md) — Resilience in group-queue
8. [Identity & Persona](08-identity.md) — OPJ1 persona, CLAUDE.md, behavioral principles
9. [Skills & Config](09-skills-config.md) — Calendar, PDF, Philosophie-Feed, MCP, settings
10. [Build & Infra](10-build-infra.md) — Dependencies, .gitignore, workflows, startup

## Migration Plan (Order of Operations)

1. **Start with clean upstream checkout** in worktree
2. **Merge skill/compact branch** (only upstream skill used)
3. **Apply build/infra changes** (package.json, Dockerfile, .gitignore, workflows)
4. **Install dependencies** and verify build
5. **Apply type definitions** (types.ts — foundation for everything else)
6. **Apply image.ts** (new file, no dependencies on other custom code)
7. **Apply Telegram channel** (telegram.ts + test + index.ts registration)
8. **Apply container changes** (container-runner.ts, agent-runner/index.ts)
9. **Apply session commands** (session-commands.ts + test)
10. **Apply index.ts changes** (image cache, session command integration, voice, model override)
11. **Apply circuit breaker** (group-queue.ts)
12. **Apply task-scheduler changes** (skill model defaults)
13. **Copy identity files** (CLAUDE.md, groups/telegram_main/CLAUDE.md)
14. **Copy custom skills** (calendar, pdf-reader, philosophie-feed, memex)
15. **Copy config files** (.mcp.json, settings.local.json)
16. **Build, test, verify**

## Risk Areas

- **container/agent-runner/src/index.ts** — Heavily modified by both sides. The /compact handler and multimodal message stream touch core SDK integration. If upstream changes `query()` options or message types, manual adjustment needed.
- **src/index.ts** — Image caching and session command integration weave into upstream's message processing loop. Upstream refactors to the message loop will require careful re-integration.
- **src/container-runner.ts** — Credential fallback and env var injection sit in `buildContainerArgs()`. If upstream changes the function signature or OneCLI integration, this needs updating.
