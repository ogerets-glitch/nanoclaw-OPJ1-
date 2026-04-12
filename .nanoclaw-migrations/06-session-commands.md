# Session Commands (/compact)

**Intent:** Allow users to trigger context compaction via `/compact` in Telegram. Intercepts the command before normal message processing, runs it through the existing container session, and reports success/failure.

## Files

- `src/session-commands.ts` — NEW (163 lines)
- `src/session-commands.test.ts` — NEW (247 lines)

## How to Apply

### 1. Copy session-commands.ts and session-commands.test.ts

Both are new files. Copy as-is from the main tree.

### 2. Key exports from session-commands.ts

```typescript
export function extractSessionCommand(
  content: string,
  triggerPattern: RegExp,
): string | null;
// Strips trigger prefix, returns '/compact' if found, null otherwise.
// Only recognizes KNOWN_SESSION_COMMANDS = new Set(['/compact']).

export function isSessionCommandAllowed(
  isMainGroup: boolean,
  isFromMe: boolean,
): boolean;
// Returns true if main group OR is_from_me (trusted sender).
// Prevents untrusted users in non-main groups from triggering /compact (DoS vector).

export interface SessionCommandDeps {
  sendMessage: (text: string) => Promise<void>;
  setTyping: (typing: boolean) => Promise<void>;
  runAgent: (prompt: string, onOutput?: ...) => Promise<'success' | 'error'>;
  closeStdin: () => void;
  advanceCursor: (timestamp: string) => void;
  formatMessages: (messages: NewMessage[], timezone: string) => string;
  canSenderInteract: (msg: NewMessage) => boolean;
}

export async function handleSessionCommand(opts: {
  missedMessages: NewMessage[];
  isMainGroup: boolean;
  groupName: string;
  triggerPattern: RegExp;
  timezone: string;
  deps: SessionCommandDeps;
}): Promise<{ handled: boolean; success: boolean }>;
```

### 3. Integration in src/index.ts

In `processGroupMessages()`, BEFORE the trigger check, add:

```typescript
import {
  extractSessionCommand,
  handleSessionCommand,
  isSessionCommandAllowed,
} from './session-commands.js';

// In processGroupMessages, after fetching missedMessages:
const cmdResult = await handleSessionCommand({
  missedMessages,
  isMainGroup,
  groupName: group.name,
  triggerPattern: getTriggerPattern(group.trigger),
  timezone: TIMEZONE,
  deps: {
    sendMessage: (text) => channel.sendMessage(chatJid, text),
    setTyping: (typing) => channel.setTyping?.(chatJid, typing) ?? Promise.resolve(),
    runAgent: (prompt, onOutput) => runAgent(group, prompt, chatJid, onOutput),
    closeStdin: () => queue.closeStdin(chatJid),
    advanceCursor: (ts) => { lastAgentTimestamp[chatJid] = ts; saveState(); },
    formatMessages,
    canSenderInteract: (msg) => {
      const hasTrigger = getTriggerPattern(group.trigger).test(msg.content.trim());
      const reqTrigger = !isMainGroup && group.requiresTrigger !== false;
      return isMainGroup || !reqTrigger || (hasTrigger && (msg.is_from_me || isTriggerAllowed(chatJid, msg.sender, loadSenderAllowlist())));
    },
  },
});
if (cmdResult.handled) return cmdResult.success;
```

Also in the message loop (`startMessageLoop`), add session command interception for piped messages:

```typescript
const loopCmdMsg = groupMessages.find(
  (m) => extractSessionCommand(m.content, getTriggerPattern(group.trigger)) !== null,
);
if (loopCmdMsg && isSessionCommandAllowed(isMainGroup, loopCmdMsg.is_from_me === true)) {
  queue.closeStdin(chatJid);
  queue.enqueueMessageCheck(chatJid);
  continue;
}
```

### 4. Agent-runner /compact handler

In `container/agent-runner/src/index.ts`, before the main query loop, add the slash command handler. See section 5 (container) — the /compact handler:

- Detects `KNOWN_SESSION_COMMANDS` = `new Set(['/compact'])`
- Runs `query()` with `resume: sessionId`, `allowedTools: []`, `permissionMode: 'bypassPermissions'`
- Includes `PreCompact` hook
- Observes `compact_boundary` system message
- Reports result with updated sessionId
