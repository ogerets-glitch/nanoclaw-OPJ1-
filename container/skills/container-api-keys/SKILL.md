---
name: container-api-keys
description: "Referenz: Welche externen API-Provider sind in JEDEM NanoClaw-Agent-Container automatisch nutzbar (via SKILL_FORWARD_ENV + OneCLI-Gateway-Host-Injektion) — unabhängig vom last30days-Skill oder irgendeinem anderen Skill. Nutze das, wenn du direkt mit ScrapeCreators, Parallel.ai, Exa.ai, xAI/Grok oder der Gemini-API sprechen willst, ohne über ein bestehendes Skill zu gehen, oder wenn der Nutzer fragt 'welche APIs hast du Zugriff auf', 'kannst du X direkt aufrufen', 'ist Key Y verfügbar', 'nutz mal Parallel/Exa/ScrapeCreators für...'. Ergänzt das generische onecli-gateway-Skill um die konkrete, auf diesem Server tatsächlich freigeschaltete Liste. NICHT bei: last30days-spezifischen Fragen (→ last30days-Skill selbst), allgemeinen OneCLI-Mechanik-Fragen ohne Bezug zu konkreten Keys (→ onecli-gateway-Skill)."
---

# Container-weite API-Keys (VPS-lokal, Stand 2026-07-09)

Dieses Skill dokumentiert einen Architektur-Fakt dieses Servers: Die fünf
unten gelisteten API-Provider sind **nicht an das `last30days`-Skill
gebunden**, obwohl deren `SKILL.md` sie als eigene `optionalEnv`-Liste
aufführt. Sie sind in **jedem** NanoClaw-Agent-Container sofort nutzbar,
egal welcher Code (welches Skill, welcher Ad-hoc-Bash/Python-Aufruf) sie
verwendet.

## Warum das so ist

1. **Env-Weiterleitung ist container-weit, nicht skill-scoped.** `.env`
   (`SKILL_FORWARD_ENV`) wird bei **jedem** Container-Spawn unconditional
   angewendet (`src/container-runner.ts`, Kommentar „Forward extra env vars
   listed in SKILL_FORWARD_ENV"). Der Name landet als `-e NAME` im
   Container — lesbar für jeden Prozess darin, nicht nur für das Skill,
   das ihn ursprünglich anforderte.
2. **Alle Skills teilen sich einen Mount.** `container/skills/` wird als
   Ganzes read-only nach `/app/skills` gemountet (`skills: "all"` in jeder
   `groups/*/container.json`) — kein Skill hat exklusiven Zugriff auf
   „seine" Keys.
3. **Die Credential-Injektion ist host-basiert, nicht skill-basiert.**
   OneCLI setzt `HTTPS_PROXY` auf den ganzen Container. Der Gateway matcht
   die **Ziel-Domain** der ausgehenden Anfrage gegen die Vault-Host-Patterns
   und überschreibt den `Authorization`-Header — unabhängig davon, welcher
   Code im Container den Call absetzt.
4. Die `optionalEnv`/`primaryEnv`-Frontmatter-Felder in `last30days/SKILL.md`
   sind reines OpenClaw-Doku-Metadata (Fremdformat des importierten Skills).
   NanoClaws eigener Code wertet sie nirgends aus, um Zugriff zu gaten.

## Aktuell verfügbare Provider (Stand 2026-07-09, verifiziert gegen OneCLI-Vault)

| Env-Var | Host-Pattern (Vault) | Provider |
|---|---|---|
| `SCRAPECREATORS_API_KEY` | `api.scrapecreators.com` | TikTok/Instagram/Threads-Suche, Transkription |
| `PARALLEL_API_KEY` | `api.parallel.ai` | Parallel AI Search API (`POST /v1/search`) |
| `EXA_API_KEY` | `api.exa.ai` | Exa Web-Suche |
| `XAI_API_KEY` | `api.x.ai` | xAI / Grok |
| `GEMINI_API_KEY` | `generativelanguage.googleapis.com` | Google Gemini |

Quelle der Wahrheit: `SKILL_FORWARD_ENV` in `/home/opj1claw/nanoclaw/.env`
(host-seitig) — nur was dort gelistet UND als Vault-Secret hinterlegt ist,
funktioniert wirklich. Bei Zweifel: `grep SKILL_FORWARD_ENV .env` auf dem
Host (nur für Oliver/root einsehbar, nicht aus dem Container heraus).

## So nutzt du sie

Genau wie im `onecli-gateway`-Skill beschrieben — Key aus `process.env`
lesen (der Wert ist nur ein Platzhalter-String, das ist normal) und die
echte API-URL direkt aufrufen:

```bash
curl -s -X POST "https://api.parallel.ai/v1/search" \
  -H "Authorization: Bearer $PARALLEL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "..."}'
```

Der Gateway ersetzt `$PARALLEL_API_KEY` unterwegs durch den echten
Vault-Wert. Kein manuelles Header-Handling nötig, kein Nachfragen beim
Nutzer nach Keys.

## Grenzen

- Nur die fünf oben gelisteten Keys sind aktuell weitergereicht. Die
  übrigen ~14 vom `last30days`-Skill unterstützten Provider (Brave, Serper,
  OpenAI, Google, Apify, X-Cookies, Bluesky, Truth Social, Xiaohongshu) sind
  auf diesem Server **nicht** konfiguriert — auch nicht über diesen Weg.
- Vault-Secrets für Anthropic/OpenRouter/Infomaniak/Arbeitsmarkt-MCP/
  OpenBrain-MCP existieren zwar im OneCLI-Vault, sind aber **nicht** in
  `SKILL_FORWARD_ENV` — die laufen über andere, dedizierte Pfade (Haupt-
  Modell-Provider bzw. MCP-Verbindungsaufbau), nicht über diesen
  Container-Env-Mechanismus.
- Ändert sich `SKILL_FORWARD_ENV` oder der Vault-Inhalt, veraltet diese
  Tabelle — im Zweifel den OneCLI-Vault-Stand neu verifizieren
  (`GET /api/secrets` über den Host, Admin-Key-Zugriff nötig).
