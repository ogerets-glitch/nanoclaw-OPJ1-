# Container & Credentials

**Intent:** Pass credentials, images, model overrides, and calendar URL to container agents. Support multimodal prompts and /compact inside the container.

## Files

- `src/container-runner.ts` — MODIFIED
- `container/agent-runner/src/index.ts` — MODIFIED (major)
- `container/Dockerfile` — MODIFIED

## How to Apply

### 1. container-runner.ts — ContainerInput type

Extend the `ContainerInput` interface:

```typescript
export interface ContainerInput {
  prompt: string;
  images?: ImageContentBlock[];      // ADD
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  script?: string;                    // upstream
  modelOverride?: string;             // ADD
  thinkingBudget?: number;            // ADD
}
```

Also add `ImageContentBlock` interface (shared with agent-runner):

```typescript
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/webp';
    data: string;
  };
}
```

### 2. container-runner.ts — Credential fallback in buildContainerArgs

After the OneCLI `applyContainerConfig` call, add fallback in the `else` branch:

```typescript
if (onecliApplied) {
  logger.info({ containerName }, 'OneCLI gateway config applied');
} else {
  // Fallback: inject credentials directly from .env when OneCLI is unavailable
  const creds = readEnvFile(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']);
  if (creds.CLAUDE_CODE_OAUTH_TOKEN) {
    args.push('-e', `CLAUDE_CODE_OAUTH_TOKEN=${creds.CLAUDE_CODE_OAUTH_TOKEN}`);
    logger.info({ containerName }, 'Credentials injected from .env (OAuth token)');
  } else if (creds.ANTHROPIC_API_KEY) {
    args.push('-e', `ANTHROPIC_API_KEY=${creds.ANTHROPIC_API_KEY}`);
    logger.info({ containerName }, 'Credentials injected from .env (API key)');
  } else {
    logger.warn(
      { containerName },
      'OneCLI gateway not reachable and no credentials in .env',
    );
  }
}
```

Requires import: `import { readEnvFile } from './env.js';`

### 3. container-runner.ts — Calendar URL and model override env vars

After credential injection, add:

```typescript
// Calendar iCal URL
const calendarUrl =
  process.env.CALENDAR_ICAL_URL ||
  readEnvFile(['CALENDAR_ICAL_URL']).CALENDAR_ICAL_URL;
if (calendarUrl) {
  args.push('-e', `CALENDAR_ICAL_URL=${calendarUrl}`);
}

// Model override and thinking budget
if (input?.modelOverride) {
  args.push('-e', `NANOCLAW_MODEL_OVERRIDE=${input.modelOverride}`);
}
if (input?.thinkingBudget) {
  args.push('-e', `NANOCLAW_THINKING_BUDGET=${input.thinkingBudget}`);
}
```

### 4. container-runner.ts — buildContainerArgs signature

Extend to accept `input`:

```typescript
async function buildContainerArgs(
  mounts: VolumeMount[],
  containerName: string,
  agentIdentifier?: string,
  input?: ContainerInput,          // ADD
): Promise<string[]> {
```

Update the call site in `runContainerAgent` to pass `input`.

### 5. container/agent-runner/src/index.ts — Multimodal message stream

This is the most complex change. The agent-runner inside the container needs to:

**a) Define ImageContentBlock type** (same as host):

```typescript
interface ImageContentBlock {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
}
```

**b) Extend MessageStream.push()** to handle images:

```typescript
push(text: string, images?: ImageContentBlock[]): void {
  let content: string | ContentBlock[];
  if (images && images.length > 0) {
    content = [
      ...images.map(img => ({
        type: 'image' as const,
        source: img.source,
      })),
      { type: 'text' as const, text },
    ];
  } else {
    content = text;
  }
  // Push as {role: 'user', content}
}
```

**c) Read model/thinking env vars:**

```typescript
const modelOverride = process.env.NANOCLAW_MODEL_OVERRIDE;
const thinkingBudget = process.env.NANOCLAW_THINKING_BUDGET;
```

Pass to `query()` options:
```typescript
...(modelOverride ? { model: modelOverride } : {}),
...(thinkingBudget ? { maxThinkingTokens: parseInt(thinkingBudget, 10) } : {}),
```

**d) /compact session command handler** — see section 6.

**e) IPC message format** — extend to include images:

```typescript
interface IpcMessage {
  text: string;
  images?: ImageContentBlock[];
}
```

Update `drainIpcInput()` and `waitForIpcMessage()` to parse this format.

### 6. container/Dockerfile

#### 6a. poppler-utils + pdf-reader (unverändert zu v1)

```dockerfile
# In the apt-get install line, add:
poppler-utils

# After npm install, add:
COPY container/skills/pdf-reader/pdf-reader /usr/local/bin/pdf-reader
RUN chmod +x /usr/local/bin/pdf-reader
```

#### 6b. YouTube-Toolchain (Commit `303a7f0`, 2026-04-24)

Zusätzlich zu poppler-utils im apt-get install line: **`python3`** (wird von yt-dlp als standalone Python-zipapp gebraucht).

Nach der agent-browser-Installation und vor den ENV-Zeilen:

```dockerfile
# Install yt-dlp (standalone Python zipapp from official release) for YouTube skills
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp.real && chmod +x /usr/local/bin/yt-dlp.real

# Install Deno as JavaScript runtime for yt-dlp signature challenges.
# Modern YouTube requires solving n-sig and player-JS challenges; yt-dlp 2026.x uses Deno (preferred) or Bun as runtime.
# Node alone is NOT accepted by yt-dlp's EJS solver (2026 change).
RUN curl -fsSL https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip \
    -o /tmp/deno.zip && \
    apt-get update && apt-get install -y --no-install-recommends unzip && \
    unzip /tmp/deno.zip -d /usr/local/bin/ && \
    chmod +x /usr/local/bin/deno && \
    rm /tmp/deno.zip && \
    apt-get remove -y unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# yt-dlp wrapper: copies read-only mounted cookies to writable /tmp (yt-dlp refreshes the cookie jar).
# Mount path follows NanoClaw's mount-security convention (all additionalMounts land under /workspace/extra/).
# Datacenter IPs are blacklisted by YouTube; cookies from a logged-in throwaway account unblock the extractor.
RUN printf '#!/bin/sh\nCOOKIES_SRC=/workspace/extra/youtube-cookies.txt\nCOOKIES_WORK=/tmp/youtube-cookies.txt\nif [ -r "$COOKIES_SRC" ]; then\n  cp "$COOKIES_SRC" "$COOKIES_WORK" 2>/dev/null && exec /usr/local/bin/yt-dlp.real --cookies "$COOKIES_WORK" "$@"\nfi\nexec /usr/local/bin/yt-dlp.real "$@"\n' > /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp
```

**Warum das drin bleibt, obwohl yt-transcript inzwischen auf Gemini läuft (2026-04-23):**
- Der last30days-Skill nutzt weiter yt-dlp für ytsearch-Fallback-Versuche (auch wenn der Hetzner-CDN-Block sie meist leer zurückkommen lässt)
- Infrastruktur im Image ist harmlos (~100 MB), Rebuild-Kosten wären höher als der Behalten-Aufwand
- Dokumentierte Sackgasse für Browser-Caption-Fallback (siehe `data/sessions/.../skills/yt-transcript/browser-fetch.sh`, Section 11)
