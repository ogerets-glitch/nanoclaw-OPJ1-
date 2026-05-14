import fs from 'fs';
import path from 'path';

import { query as sdkQuery, type HookCallback, type PreCompactHookInput, type SessionStartHookInput } from '@anthropic-ai/claude-agent-sdk';

// Regex shared by Pre/Post hooks to flag URLs that look like image files
// based on their path/query. The PostToolUse sanitizer is the real safety
// net (it inspects bytes/types), but blocking the call up front gives the
// agent a clear instructional error so it switches to search_images.
const IMAGE_URL_RE = /\.(jpe?g|png|gif|webp|bmp|tiff?|avif|heic|svg)(\?|#|$)/i;

import { clearContainerToolInFlight, setContainerToolInFlight } from '../db/connection.js';
import { registerProvider } from './provider-registry.js';
import { redactSkillFulltexts, SESSION_START_COMPACT_DISCLAIMER } from './skill-redaction.js';
import type { AgentProvider, AgentQuery, McpServerConfig, ProviderEvent, ProviderOptions, QueryInput } from './types.js';

function log(msg: string): void {
  console.error(`[claude-provider] ${msg}`);
}

// Deferred SDK builtins that either sidestep nanoclaw's own scheduling or
// don't fit our async message-passing model (they're designed for Claude
// Code's interactive UI and would hang here).
//
// - CronCreate / CronDelete / CronList / ScheduleWakeup: we have durable
//   scheduling via mcp__nanoclaw__schedule_task.
// - AskUserQuestion: SDK returns a placeholder instead of blocking on a
//   real answer — we have mcp__nanoclaw__ask_user_question that persists
//   the question and blocks on the real reply.
// - EnterPlanMode / ExitPlanMode / EnterWorktree / ExitWorktree: Claude
//   Code UI affordances; in a headless container they'd appear stuck.
const SDK_DISALLOWED_TOOLS = [
  'CronCreate',
  'CronDelete',
  'CronList',
  'ScheduleWakeup',
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'EnterWorktree',
  'ExitWorktree',
];

// Tool allowlist for NanoClaw agent containers. MCP-tool entries are derived
// at the call site from the registered `mcpServers` map so that any server
// added via `add_mcp_server` (or wired in container.json directly) is
// reachable to the agent — without this, the SDK's allowedTools filter
// silently drops every MCP namespace not listed here.
const TOOL_ALLOWLIST = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task',
  'TaskOutput',
  'TaskStop',
  'TeamCreate',
  'TeamDelete',
  'SendMessage',
  'TodoWrite',
  'ToolSearch',
  'Skill',
  'NotebookEdit',
];

// MCP server names are sanitized by the SDK when forming tool prefixes:
// any character outside [A-Za-z0-9_-] becomes '_'. Mirror that here so our
// allowlist patterns match what the SDK actually exposes.
function mcpAllowPattern(serverName: string): string {
  return `mcp__${serverName.replace(/[^a-zA-Z0-9_-]/g, '_')}__*`;
}

interface SDKUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
  session_id: string;
}

/**
 * Push-based async iterable for streaming user messages to the Claude SDK.
 */
class MessageStream {
  private queue: SDKUserMessage[] = [];
  private waiting: (() => void) | null = null;
  private done = false;

  push(text: string): void {
    this.queue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: '',
    });
    this.waiting?.();
  }

  end(): void {
    this.done = true;
    this.waiting?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    while (true) {
      while (this.queue.length > 0) {
        yield this.queue.shift()!;
      }
      if (this.done) return;
      await new Promise<void>((r) => {
        this.waiting = r;
      });
      this.waiting = null;
    }
  }
}

// ── Transcript archiving (PreCompact hook) ──

interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseTranscript(content: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text = typeof entry.message.content === 'string' ? entry.message.content : entry.message.content.map((c: { text?: string }) => c.text || '').join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const textParts = entry.message.content.filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text);
        const text = textParts.join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {
      /* skip unparseable lines */
    }
  }
  return messages;
}

function formatTranscriptMarkdown(messages: ParsedMessage[], title?: string | null, assistantName?: string): string {
  const now = new Date();
  const dateStr = now.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  const lines = [`# ${title || 'Conversation'}`, '', `Archived: ${dateStr}`, '', '---', ''];
  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : assistantName || 'Assistant';
    const content = msg.content.length > 2000 ? msg.content.slice(0, 2000) + '...' : msg.content;
    lines.push(`**${sender}**: ${content}`, '');
  }
  return lines.join('\n');
}

/**
 * PreToolUse hook: record the current tool + its declared timeout so the host
 * sweep can widen its stuck tolerance while Bash is running a long-declared
 * script. Defense-in-depth: if SDK_DISALLOWED_TOOLS slips through somehow,
 * block the call here instead of letting the agent hang.
 */
const preToolUseHook: HookCallback = async (input) => {
  const i = input as { tool_name?: string; tool_input?: Record<string, unknown> };
  const toolName = i.tool_name ?? '';
  if (SDK_DISALLOWED_TOOLS.includes(toolName)) {
    return {
      decision: 'block',
      stopReason: `Tool '${toolName}' is not available in this environment — use the nanoclaw equivalent.`,
    } as unknown as ReturnType<HookCallback>;
  }
  // Image-loop guard: WebFetch returns image-content-blocks for image URLs,
  // and a single broken image poisons the history with permanent HTTP 400s
  // ("Could not process image"). Block image-extension URLs up front so the
  // agent reroutes via mcp__nanoclaw__search_images + download_image + send_file.
  if (toolName === 'WebFetch') {
    const url = typeof i.tool_input?.url === 'string' ? (i.tool_input.url as string) : '';
    if (url && IMAGE_URL_RE.test(url)) {
      log(`PreToolUse: blocked WebFetch on image URL ${url}`);
      return {
        decision: 'block',
        stopReason:
          'WebFetch loads images as content-blocks into the conversation history. A broken image bricks the session with permanent HTTP 400 errors. Use mcp__nanoclaw__search_images to find images, mcp__nanoclaw__download_image to fetch them to /workspace/agent/.image-cache/, then mcp__nanoclaw__send_file to deliver them to the user.',
      } as unknown as ReturnType<HookCallback>;
    }
  }
  // Bash exposes its timeout via the tool_input.timeout field (ms). Any other
  // tool: no declared timeout.
  const declaredTimeoutMs =
    toolName === 'Bash' && typeof i.tool_input?.timeout === 'number' ? (i.tool_input.timeout as number) : null;
  try {
    setContainerToolInFlight(toolName, declaredTimeoutMs);
  } catch (err) {
    log(`PreToolUse: failed to record container_state: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { continue: true };
};

/**
 * Detects any image-content-block in a tool response payload, no matter how
 * deeply it's wrapped. We don't trust the URL filter alone: redirects, CDN
 * proxies, and `data:image/...` URIs can deliver image bytes through URLs
 * that don't have an image extension.
 */
function containsImageBlock(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsImageBlock);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (obj.type === 'image') return true;
    return Object.values(obj).some(containsImageBlock);
  }
  return false;
}

/**
 * Clear in-flight tool on PostToolUse / PostToolUseFailure. Also acts as
 * the second line of defence against image-content-block injection: if a
 * tool result contains any image block (e.g. WebFetch slipped past the
 * URL regex), replace the output with a text marker so the bytes never
 * enter the conversation history.
 */
const postToolUseHook: HookCallback = async (input) => {
  try {
    clearContainerToolInFlight();
  } catch (err) {
    log(`PostToolUse: failed to clear container_state: ${err instanceof Error ? err.message : String(err)}`);
  }

  const i = input as { tool_name?: string; tool_response?: unknown };
  const toolName = i.tool_name ?? '';
  // Only walk the response for tools that can plausibly emit image blocks.
  // Bash/Read/Edit/Glob/Grep/Todo* return text or JSON and would just
  // burn cycles on every call otherwise.
  const isImageRiskyTool =
    toolName === 'WebFetch' || toolName === 'WebSearch' || toolName.startsWith('mcp__');
  if (isImageRiskyTool && i.tool_response !== undefined && containsImageBlock(i.tool_response)) {
    log(`PostToolUse: stripped image content from ${toolName} response`);
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: {
          content: [
            {
              type: 'text',
              text: `Image content stripped by nanoclaw to prevent invalid-image API loops. Use mcp__nanoclaw__search_images + mcp__nanoclaw__download_image + mcp__nanoclaw__send_file to deliver images to the user — those bytes never enter the conversation history.`,
            },
          ],
        },
      },
    } as unknown as ReturnType<HookCallback>;
  }

  return { continue: true };
};

/**
 * On SessionEnd, wipe the per-agent image cache so we don't leak disk
 * space across sessions. The directory lives under /workspace/agent (the
 * group's persistent volume), so without explicit cleanup it would grow
 * unbounded.
 */
const sessionEndHook: HookCallback = async () => {
  const cacheDir = '/workspace/agent/.image-cache';
  let entries: string[];
  try {
    entries = fs.readdirSync(cacheDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { continue: true };
    log(`SessionEnd: image-cache readdir failed: ${err instanceof Error ? err.message : String(err)}`);
    return { continue: true };
  }
  for (const entry of entries) {
    try {
      fs.rmSync(path.join(cacheDir, entry), { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
  return { continue: true };
};

function createPreCompactHook(assistantName?: string): HookCallback {
  return async (input) => {
    const preCompact = input as PreCompactHookInput;
    const { transcript_path: transcriptPath, session_id: sessionId } = preCompact;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      log('No transcript found for archiving');
      return {};
    }

    // LOCAL PATCH (2026-05-08): Shrink skill bodies in the transcript BEFORE
    // compaction so the SDK rebuilds its invoked-skills list from markers and
    // the post-compact reminder block stays small. Failures here must never
    // block archiving — log and continue.
    try {
      const r = redactSkillFulltexts(transcriptPath);
      if (r.redacted > 0) {
        log(`PreCompact: redacted ${r.redacted}/${r.scanned} skill bodies, saved ${r.bytesSaved} bytes`);
      }
    } catch (err) {
      log(`PreCompact: skill-fulltext redaction failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const messages = parseTranscript(content);
      if (messages.length === 0) return {};

      // Try to get summary from sessions index
      let summary: string | undefined;
      const indexPath = path.join(path.dirname(transcriptPath), 'sessions-index.json');
      if (fs.existsSync(indexPath)) {
        try {
          const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
          summary = index.entries?.find((e: { sessionId: string; summary?: string }) => e.sessionId === sessionId)?.summary;
        } catch {
          /* ignore */
        }
      }

      const name = summary
        ? summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
        : `conversation-${new Date().getHours().toString().padStart(2, '0')}${new Date().getMinutes().toString().padStart(2, '0')}`;

      const conversationsDir = '/workspace/agent/conversations';
      fs.mkdirSync(conversationsDir, { recursive: true });
      const filename = `${new Date().toISOString().split('T')[0]}-${name}.md`;
      fs.writeFileSync(path.join(conversationsDir, filename), formatTranscriptMarkdown(messages, summary, assistantName));
      log(`Archived conversation to ${filename}`);
    } catch (err) {
      log(`Failed to archive transcript: ${err instanceof Error ? err.message : String(err)}`);
    }
    return {};
  };
}

// LOCAL PATCH (2026-05-08): SessionStart-Hook for source='compact' — injects a
// disclaimer as additionalContext after every compaction so the model treats
// the post-compact "skills invoked"-block as historical, even if the
// PreCompact-redaction missed an edge case. See skill-redaction.ts for the
// full rationale.
const sessionStartHook: HookCallback = async (input) => {
  const session = input as SessionStartHookInput;
  if (session.source !== 'compact') {
    return { continue: true };
  }
  return {
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: SESSION_START_COMPACT_DISCLAIMER,
    },
  } as unknown as ReturnType<HookCallback>;
};

// ── Provider ──

/**
 * Claude Code auto-compacts context at this window (tokens). Kept here so
 * the generic bootstrap doesn't need to know about Claude-specific env vars.
 *
 * Operator override: set CLAUDE_CODE_AUTO_COMPACT_WINDOW in the host env to
 * raise or lower the threshold without editing source — useful when running
 * with a 1M-context model variant or when emergency-tuning a deployment.
 */
const CLAUDE_CODE_AUTO_COMPACT_WINDOW = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW || '165000';

/**
 * Stale-session detection. Matches Claude Code's error text when a
 * resumed session can't be found — missing transcript .jsonl, unknown
 * session ID, etc.
 */
const STALE_SESSION_RE = /no conversation found|ENOENT.*\.jsonl|session.*not found/i;

export class ClaudeProvider implements AgentProvider {
  readonly supportsNativeSlashCommands = true;

  private assistantName?: string;
  private mcpServers: Record<string, McpServerConfig>;
  private env: Record<string, string | undefined>;
  private additionalDirectories?: string[];
  private model?: string;
  private effort?: string;

  constructor(options: ProviderOptions = {}) {
    this.assistantName = options.assistantName;
    this.mcpServers = options.mcpServers ?? {};
    this.additionalDirectories = options.additionalDirectories;
    this.model = options.model;
    this.effort = options.effort;
    this.env = {
      ...(options.env ?? {}),
      CLAUDE_CODE_AUTO_COMPACT_WINDOW,
    };
  }

  isSessionInvalid(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return STALE_SESSION_RE.test(msg);
  }

  query(input: QueryInput): AgentQuery {
    const stream = new MessageStream();
    stream.push(input.prompt);

    const instructions = input.systemContext?.instructions;

    const sdkResult = sdkQuery({
      prompt: stream,
      options: {
        cwd: input.cwd,
        additionalDirectories: this.additionalDirectories,
        resume: input.continuation,
        pathToClaudeCodeExecutable: '/pnpm/claude',
        systemPrompt: instructions ? { type: 'preset' as const, preset: 'claude_code' as const, append: instructions } : undefined,
        allowedTools: [
          ...TOOL_ALLOWLIST,
          ...Object.keys(this.mcpServers).map(mcpAllowPattern),
        ],
        disallowedTools: SDK_DISALLOWED_TOOLS,
        env: this.env,
        model: this.model,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        effort: this.effort as any,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: ['project', 'user'],
        thinking: { type: 'adaptive' as const },
        mcpServers: this.mcpServers,
        hooks: {
          PreToolUse: [{ hooks: [preToolUseHook] }],
          PostToolUse: [{ hooks: [postToolUseHook] }],
          PostToolUseFailure: [{ hooks: [postToolUseHook] }],
          PreCompact: [{ hooks: [createPreCompactHook(this.assistantName)] }],
          SessionStart: [{ hooks: [sessionStartHook] }],
          SessionEnd: [{ hooks: [sessionEndHook] }],
        },
      },
    });

    let aborted = false;

    async function* translateEvents(): AsyncGenerator<ProviderEvent> {
      let messageCount = 0;
      for await (const message of sdkResult) {
        if (aborted) return;
        messageCount++;

        // Yield activity for every SDK event so the poll loop knows the agent is working
        yield { type: 'activity' };

        if (message.type === 'system' && message.subtype === 'init') {
          yield { type: 'init', continuation: message.session_id };
        } else if (message.type === 'result') {
          const text = 'result' in message ? (message as { result?: string }).result ?? null : null;
          yield { type: 'result', text };
        } else if (message.type === 'system' && (message as { subtype?: string }).subtype === 'api_retry') {
          yield { type: 'error', message: 'API retry', retryable: true };
        } else if (message.type === 'system' && (message as { subtype?: string }).subtype === 'rate_limit_event') {
          yield { type: 'error', message: 'Rate limit', retryable: false, classification: 'quota' };
        } else if (message.type === 'system' && (message as { subtype?: string }).subtype === 'compact_boundary') {
          const meta = (message as { compact_metadata?: { pre_tokens?: number } }).compact_metadata;
          const detail = meta?.pre_tokens ? ` (${meta.pre_tokens.toLocaleString()} tokens compacted)` : '';
          yield { type: 'result', text: `Context compacted${detail}.` };
        } else if (message.type === 'system' && (message as { subtype?: string }).subtype === 'task_notification') {
          const tn = message as { summary?: string };
          yield { type: 'progress', message: tn.summary || 'Task notification' };
        }
      }
      log(`Query completed after ${messageCount} SDK messages`);
    }

    return {
      push: (msg) => stream.push(msg),
      end: () => stream.end(),
      events: translateEvents(),
      abort: () => {
        aborted = true;
        stream.end();
      },
    };
  }
}

registerProvider('claude', (opts) => new ClaudeProvider(opts));
