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

Add poppler-utils and pdf-reader:

```dockerfile
# In the apt-get install line, add:
poppler-utils

# After npm install, add:
COPY container/skills/pdf-reader/pdf-reader /usr/local/bin/pdf-reader
RUN chmod +x /usr/local/bin/pdf-reader
```
