/**
 * Delta-Chat channel adapter for NanoClaw v2.
 *
 * Talks to a local `deltachat-rpc-server` binary over stdio JSON-RPC. The
 * binary is spawned as a child process and torn down on adapter shutdown.
 * Account database lives under `DELTACHAT_ACCOUNTS_DIR` (default
 * `~/.deltachat-data/accounts`) and must already contain a configured
 * chatmail account — bootstrap it via `pnpm tsx setup/channels/deltachat.ts`.
 *
 * Inbound: subscribes to `IncomingMsg` events, forwards text + transcribed
 *   voice + image/file attachments from contacts present in the
 *   DELTACHAT_ALLOWED_CONTACT_IDS allowlist. Other contacts are silently
 *   dropped (no auto-reply, doesn't betray bot existence).
 * Outbound: chunked text via `miscSendMsg`, plus native file attachments
 *   with `viewtype` inferred from extension/mime.
 *
 * Pattern: pairs closely with simplex.ts; voice STT, allowlist, chunking
 *   and outbound-file path are intentionally identical so OPJ1 operators
 *   can map mental models 1:1. Differences are limited to:
 *     - transport (stdio subprocess vs WebSocket daemon)
 *     - inbound file types (full coverage vs voice-only)
 *     - outbound file delivery (native viewtype vs `/file` workaround).
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

import { StdioDeltaChat, type T, type DcEventType } from '@deltachat/jsonrpc-client';

import { readEnvFile } from '../env.js';
import { log } from '../log.js';
import { registerChannelAdapter } from './channel-registry.js';
import type { ChannelAdapter, ChannelSetup, InboundMessage, OutboundFile, OutboundMessage } from './adapter.js';

const PLATFORM_PREFIX = 'deltachat:';
// Per-chunk character budget. Kept under deltachat-core's DC_DESIRED_TEXT_LEN
// (3800 = 38 lines × 100 chars) so a single chunk is never display-truncated
// with "[...] show full message" — which would break forwarding/copying.
const DELTACHAT_CHUNK_MAX = 3000;
// Per-chunk display-line budget. deltachat-core (src/tools.rs truncate_by_lines)
// truncates the bubble once it exceeds DC_DESIRED_TEXT_LINES (38), where a
// physical line counts as ceil(len / DELTACHAT_LINE_LEN) display-lines. Char
// chunking alone misses this: many short lines blow past 38 long before 3000
// chars. 34 leaves a small buffer under 38.
const DELTACHAT_MAX_LINES = 34;
// deltachat-core's DC_DESIRED_TEXT_LINE_LEN: a physical line longer than this
// is counted as multiple display-lines by the truncation logic.
const DELTACHAT_LINE_LEN = 100;
// 200ms inter-chunk pacing matches simplex.ts — the deltachat-rpc-server
// can take a burst, but recipients see chunks more reliably in order.
const SEND_DELAY_MS = 200;
// Self-loops in Delta-Chat: contact id 1 is always the bot itself.
const DELTA_SELF_CONTACT_ID = 1;

// View-types from deltachat-core. `Voice`/`Audio` go through STT; the rest
// arrive as inline file attachments and are forwarded to the agent via path.
const VOICE_VIEW_TYPES = new Set<T.Viewtype>(['Voice', 'Audio']);
const FILE_VIEW_TYPES = new Set<T.Viewtype>(['Image', 'Gif', 'Sticker', 'Video', 'File', 'Vcard', 'Webxdc']);

// Voice/STT — mirrors simplex.ts defaults.
const MAX_VOICE_BYTES = 25 * 1024 * 1024;
// Inbound attachments: mail-provider hard-caps at ~25 MB anyway. Anything
// bigger is rejected with an inline note.
const MAX_INBOUND_FILE_BYTES = 25 * 1024 * 1024;
const MAX_OUTBOUND_FILE_BYTES = 25 * 1024 * 1024;
// TTL for `attachments-in/`. Cleanup runs once on connect — best-effort.
const ATTACHMENT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const IMAGE_VIEW_TYPES = new Set<T.Viewtype>(['Image', 'Gif', 'Sticker']);
const VIDEO_VIEW_TYPES = new Set<T.Viewtype>(['Video']);

// Auto-respawn schedule when the deltachat-rpc-server subprocess exits
// unexpectedly. Index = prior attempt count, value = delay before the next
// respawn try in milliseconds. Attempts beyond the last entry use the final
// value as a steady-state poll cadence.
const RESPAWN_BACKOFF_MS: readonly number[] = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];
// After this many consecutive failures we give up and leave the channel dead
// so a structural defect (corrupt DB, missing binary) doesn't burn CPU in a
// permanent retry loop. The operator must `systemctl restart` then.
const MAX_RESPAWN_ATTEMPTS = 12;
// Once a respawn has stayed connected this long, reset the attempt counter so
// a future single crash starts from the fast end of the backoff sequence.
const RESPAWN_STABILITY_RESET_MS = 5 * 60 * 1000;

/**
 * Delay before the next respawn attempt given how many prior attempts have
 * already failed. Exported for unit tests; pure function.
 */
export function computeRespawnDelay(priorAttempts: number): number {
  if (priorAttempts < 0) return RESPAWN_BACKOFF_MS[0]!;
  if (priorAttempts >= RESPAWN_BACKOFF_MS.length) {
    return RESPAWN_BACKOFF_MS[RESPAWN_BACKOFF_MS.length - 1]!;
  }
  return RESPAWN_BACKOFF_MS[priorAttempts]!;
}

interface DeltachatAdapterConfig {
  rpcServerPath: string;
  accountsDir: string;
  attachmentsInDir: string;
  attachmentsOutDir: string;
  allowedContactIds: Set<number>;
  sttUrl: string;
  sttLanguage: string;
  sttTimeoutMs: number;
  /**
   * Optional path the agent container will see for inbound attachments.
   * When set, the adapter rewrites every host-side `attachmentsInDir` prefix
   * to this prefix before handing the path to the agent — so the agent reads
   * files via the container-mount path instead of an unreachable host path.
   * Leave undefined when the agent process runs on the host directly.
   */
  agentAttachmentsPath: string | null;
}

/** Map a host attachment path to the path the container agent sees. */
export function toAgentPath(hostPath: string, hostPrefix: string, agentPrefix: string | null): string {
  if (!agentPrefix) return hostPath;
  if (!hostPath.startsWith(hostPrefix)) return hostPath;
  return agentPrefix + hostPath.slice(hostPrefix.length);
}

/** Display-lines deltachat-core attributes to one physical line (no '\n'). */
function displayLines(line: string): number {
  return Math.max(1, Math.ceil(line.length / DELTACHAT_LINE_LEN));
}

/** Total display-lines of a (possibly multi-line) text. */
function displayLineCount(text: string): number {
  let n = 0;
  for (const line of text.split('\n')) n += displayLines(line);
  return n;
}

/**
 * Break a single physical line (no '\n') into pieces that each fit the char
 * budget and, when `maxLines` is set, the display-line budget. Prefers word
 * boundaries; falls back to a hard cut for unbroken tokens (e.g. long URLs).
 */
function splitLongLine(line: string, limit: number, maxLines?: number): string[] {
  const max = maxLines === undefined ? limit : Math.min(limit, maxLines * DELTACHAT_LINE_LEN);
  if (line.length <= max) return [line];
  const parts: string[] = [];
  let rest = line;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) cut = max; // no word boundary in range → hard cut
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^ /, '');
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Split `text` into chunks Delta-Chat renders inline without the "[...] show
 * full message" truncation (which breaks forwarding/copying). A chunk stays
 * within `limit` characters and, when `maxLines` is given, `maxLines`
 * display-lines. Splits prefer line boundaries; over-long single lines are
 * broken at word boundaries with a hard cut as last resort.
 *
 * `maxLines` models Delta-Chat's display-line truncation specifically; it is
 * optional so the same routine can serve channels without that limit (they
 * omit it and only the character budget applies).
 */
export function chunkText(text: string, limit: number, maxLines?: number): string[] {
  if (text.length <= limit && (maxLines === undefined || displayLineCount(text) <= maxLines)) {
    return [text];
  }
  // 1. Reduce every physical line to atoms that each fit both budgets.
  const atoms: string[] = [];
  for (const line of text.split('\n')) {
    atoms.push(...splitLongLine(line, limit, maxLines));
  }
  // 2. Greedily pack atoms (rejoined with '\n') into chunks within budget.
  const chunks: string[] = [];
  let cur = '';
  let curLines = 0;
  for (const atom of atoms) {
    const atomLines = displayLines(atom);
    const sep = cur === '' ? 0 : 1; // the '\n' that rejoins atoms
    const fitsChars = cur.length + sep + atom.length <= limit;
    const fitsLines = maxLines === undefined || curLines + atomLines <= maxLines;
    if (cur !== '' && (!fitsChars || !fitsLines)) {
      chunks.push(cur);
      cur = '';
      curLines = 0;
    }
    cur = cur === '' ? atom : cur + '\n' + atom;
    curLines += atomLines;
  }
  if (cur !== '') chunks.push(cur);
  return chunks;
}

async function transcribeAudio(
  filePath: string,
  sttUrl: string,
  language: string,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const buf = await readFile(filePath);
    const form = new FormData();
    // Generic filename + audio/mp4 hint so the STT server's content-sniffing
    // works for both Delta-Chat (.ogg/.mp3) and re-encoded voice uploads.
    form.append('file', new Blob([new Uint8Array(buf)], { type: 'audio/mp4' }), 'voice.m4a');
    form.append('language', language);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(sttUrl, { method: 'POST', body: form, signal: ctrl.signal });
      if (!res.ok) {
        log.warn('Delta-Chat STT: non-OK response', { status: res.status, sttUrl });
        return null;
      }
      const json = (await res.json()) as { text?: string };
      const text = (json.text ?? '').trim();
      return text || null;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    log.warn('Delta-Chat STT: call failed', { sttUrl, err });
    return null;
  }
}

/** Sanitize a filename for safe disk storage — no traversal, no quoting fun. */
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned.slice(0, 200) || 'attachment.bin';
}

export function toolHintForMime(mime: string | null): string {
  const m = (mime ?? '').toLowerCase();
  if (m.includes('pdf')) return 'Bitte mit deinem PDF-Tool lesen — NICHT als rohe Bytes einlesen.';
  if (m.includes('wordprocessingml') || m === 'application/msword') {
    return 'Bitte mit dem docx-Skill lesen (NICHT als rohe Bytes).';
  }
  if (m.includes('spreadsheetml') || m.includes('excel') || m === 'text/csv') {
    return 'Bitte mit dem xlsx- oder CSV-Skill lesen (NICHT als rohe Bytes).';
  }
  if (m.includes('presentationml') || m.includes('powerpoint')) {
    return 'Bitte mit dem pptx-Skill lesen (NICHT als rohe Bytes).';
  }
  if (m.startsWith('text/') || m === 'application/json' || m === 'application/xml') {
    return 'Kann direkt mit dem read-Tool gelesen werden.';
  }
  return 'Bitte das passende Tool waehlen (NICHT als rohe Bytes einlesen).';
}

/**
 * Pick a Viewtype for outbound files. Voice messages need `Voice` so the
 * recipient app shows a play-inline bubble; images need `Image` so they
 * preview; everything else is `File`. Mime is preferred over extension.
 */
export function viewtypeForOutbound(filename: string, dataLength: number): T.Viewtype {
  const ext = extname(filename).toLowerCase();
  if (['.ogg', '.opus', '.m4a', '.aac', '.mp3', '.wav'].includes(ext)) {
    // Delta-Chat treats `Voice` and `Audio` differently in the UI; Voice is
    // the right call for short bot replies, Audio for long-form. We send
    // anything <2 MB as Voice on the assumption it's a TTS clip.
    return dataLength < 2 * 1024 * 1024 ? 'Voice' : 'Audio';
  }
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)) return 'Image';
  if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) return 'Video';
  return 'File';
}

/** Best-effort recursive cleanup of attachment directories older than the TTL. */
async function cleanupOldAttachments(dir: string, ttlMs: number): Promise<void> {
  const cutoff = Date.now() - ttlMs;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // dir doesn't exist yet
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    try {
      const s = await stat(full);
      if (s.mtimeMs < cutoff) {
        await rm(full, { recursive: true, force: true });
      }
    } catch {
      /* best-effort */
    }
  }
}

function createDeltachatAdapter(config: DeltachatAdapterConfig): ChannelAdapter {
  let proc: ChildProcessByStdio<Writable, Readable, Readable> | null = null;
  let dc: StdioDeltaChat | null = null;
  let setup: ChannelSetup | null = null;
  let ourAccountId: number | null = null;
  let connected = false;
  // Set by teardown() so the exit-handler can distinguish an operator-initiated
  // shutdown from an unexpected crash.
  let teardownRequested = false;
  // Counts consecutive failed respawn attempts. Reset to 0 by the stability
  // timer once a respawn has stayed up for RESPAWN_STABILITY_RESET_MS.
  let respawnAttempts = 0;
  let respawnInFlight = false;
  let stabilityResetTimer: NodeJS.Timeout | null = null;

  function emitInbound(
    contactId: number,
    senderName: string,
    itemId: string,
    text: string,
    ts: string,
    extras?: {
      attachmentPath?: string;
      attachmentName?: string;
      attachmentMime?: string | null;
      attachmentViewType?: T.Viewtype;
      toolHint?: string;
    },
  ): void {
    const platformId = `${PLATFORM_PREFIX}${contactId}`;
    // The router serializes `content` to JSON before writing to the session
    // DB. Keep field names short and stable — agents will read these via
    // their session inbox.
    const content: Record<string, unknown> = {
      text,
      sender: String(contactId),
      senderId: platformId,
      senderName,
    };
    if (extras?.attachmentPath) {
      content.attachmentPath = extras.attachmentPath;
      content.attachmentName = extras.attachmentName ?? null;
      content.attachmentMime = extras.attachmentMime ?? null;
      content.attachmentViewType = extras.attachmentViewType ?? null;
      if (extras.toolHint) content.attachmentToolHint = extras.toolHint;
    }
    const inbound: InboundMessage = {
      id: itemId,
      kind: 'chat',
      content,
      timestamp: ts,
    };
    void setup?.onInbound(platformId, null, inbound);
  }

  /**
   * Copy an inbound attachment from deltachat-core's blobdir (which it may
   * clean up at any time) into our stable `attachments-in/oliver-<contact>/<id>-<rand>/<name>`
   * layout. Returns the new path on success, null on failure (too large, IO
   * error). Mirrors Pi-Bridge `_collect_inbound_attachment`.
   */
  async function copyInboundAttachment(
    srcPath: string,
    srcName: string | null,
    contactId: number,
    msgId: number,
  ): Promise<{ path: string; name: string } | null> {
    let s;
    try {
      s = await stat(srcPath);
    } catch (err) {
      log.warn('Delta-Chat: inbound file missing from blobdir', { srcPath, err });
      return null;
    }
    if (s.size > MAX_INBOUND_FILE_BYTES) {
      log.warn('Delta-Chat: inbound file too large, rejecting', { srcPath, size: s.size });
      return null;
    }
    const tag = Math.random().toString(36).slice(2, 10);
    const dstDir = join(config.attachmentsInDir, `oliver-${contactId}`, `${msgId}-${tag}`);
    const safeName = sanitizeFilename(srcName || `attachment-${msgId}.bin`);
    const dstPath = join(dstDir, safeName);
    try {
      await mkdir(dstDir, { recursive: true });
      await copyFile(srcPath, dstPath);
    } catch (err) {
      log.warn('Delta-Chat: failed to copy attachment', { srcPath, dstPath, err });
      return null;
    }
    return { path: dstPath, name: safeName };
  }

  async function handleIncoming(accountId: number, _chatId: number, msgId: number): Promise<void> {
    if (!dc) return;
    let msg: T.Message;
    try {
      msg = await dc.rpc.getMessage(accountId, msgId);
    } catch (err) {
      log.warn('Delta-Chat: getMessage failed', { msgId, err });
      return;
    }
    const fromId = msg.fromId;
    if (fromId === DELTA_SELF_CONTACT_ID) return; // skip our own outbound
    if (!config.allowedContactIds.has(fromId)) {
      // Silent drop — never reply. Mark seen so deltachat doesn't keep
      // re-delivering on restart.
      try {
        await dc.rpc.markseenMsgs(accountId, [msgId]);
      } catch {
        /* best-effort */
      }
      log.debug('Delta-Chat: dropping message from non-allowlisted contact', { fromId });
      return;
    }
    const senderName: string = msg.sender.displayName || msg.sender.address || `contact-${fromId}`;
    const ts = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString();
    const itemId = String(msgId);
    const text = (msg.text ?? '').trim();

    // Voice/Audio: transcribe locally, forward as text. Audio file itself
    // is not handed to the agent — the transcript is the useful payload.
    if (VOICE_VIEW_TYPES.has(msg.viewType) && msg.file) {
      const size = msg.fileBytes ?? 0;
      if (size > MAX_VOICE_BYTES) {
        emitInbound(fromId, senderName, itemId, '[Voice abgelehnt: Datei zu groß]', ts);
        log.warn('Delta-Chat voice: rejected, too large', { fromId, size });
        try {
          await dc.rpc.markseenMsgs(accountId, [msgId]);
        } catch {
          /* best-effort */
        }
        return;
      }
      const transcript = await transcribeAudio(msg.file, config.sttUrl, config.sttLanguage, config.sttTimeoutMs);
      const composed = transcript
        ? text
          ? `${text}\n\n[Voice] ${transcript}`
          : `[Voice] ${transcript}`
        : '[Voice konnte nicht transkribiert werden]';
      emitInbound(fromId, senderName, itemId, composed, ts);
      log.info('Delta-Chat voice transcribed', {
        platformId: `${PLATFORM_PREFIX}${fromId}`,
        msgId,
        ok: transcript !== null,
        len: transcript?.length ?? 0,
      });
      try {
        await dc.rpc.markseenMsgs(accountId, [msgId]);
      } catch {
        /* best-effort */
      }
      return;
    }

    // Image / File / Video / etc — copy to stable path, hand the agent
    // the path + mime + tool hint. The agent decides how to read it.
    if (FILE_VIEW_TYPES.has(msg.viewType) && msg.file) {
      const copied = await copyInboundAttachment(msg.file, msg.fileName ?? null, fromId, msgId);
      if (!copied) {
        emitInbound(
          fromId,
          senderName,
          itemId,
          `[Anhang konnte nicht uebernommen werden (zu gross >${Math.floor(
            MAX_INBOUND_FILE_BYTES / 1_000_000,
          )} MB oder Fehler beim Kopieren)]`,
          ts,
        );
        try {
          await dc.rpc.markseenMsgs(accountId, [msgId]);
        } catch {
          /* best-effort */
        }
        return;
      }
      const isImage = IMAGE_VIEW_TYPES.has(msg.viewType);
      const isVideo = VIDEO_VIEW_TYPES.has(msg.viewType);
      const typeLabel = isImage ? 'Bild' : isVideo ? 'Video' : 'Datei';
      const hint = isImage
        ? 'Wenn dein Modell Vision unterstuetzt: Bitte das Bild direkt anschauen. Sonst: Tool nutzen, das den Pfad lesen kann.'
        : toolHintForMime(msg.fileMime);
      // Container agents see the file under the mounted path, not the host
      // path. The agent-side prompt must use the container path or `ls`
      // gives ENOENT.
      const agentPath = toAgentPath(copied.path, config.attachmentsInDir, config.agentAttachmentsPath);
      const composed = text
        ? `${text}\n\n[Anhang: ${typeLabel} '${copied.name}' (Typ ${
            msg.fileMime ?? 'unbekannt'
          }) liegt unter:\n  ${agentPath}\n${hint}]`
        : `[Anhang: ${typeLabel} '${copied.name}' (Typ ${msg.fileMime ?? 'unbekannt'}) liegt unter:\n  ${
            agentPath
          }\n${hint}]\n\nBitte beschreibe oder fasse zusammen, was du siehst.`;
      emitInbound(fromId, senderName, itemId, composed, ts, {
        attachmentPath: agentPath,
        attachmentName: copied.name,
        attachmentMime: msg.fileMime,
        attachmentViewType: msg.viewType,
        toolHint: hint,
      });
      log.info('Delta-Chat attachment received', {
        platformId: `${PLATFORM_PREFIX}${fromId}`,
        msgId,
        viewType: msg.viewType,
        mime: msg.fileMime,
        path: copied.path,
        size: msg.fileBytes,
      });
      try {
        await dc.rpc.markseenMsgs(accountId, [msgId]);
      } catch {
        /* best-effort */
      }
      return;
    }

    // Text-only — happy path.
    if (text) {
      emitInbound(fromId, senderName, itemId, text, ts);
      log.info('Delta-Chat message received', {
        platformId: `${PLATFORM_PREFIX}${fromId}`,
        msgId,
        len: text.length,
      });
      try {
        await dc.rpc.markseenMsgs(accountId, [msgId]);
      } catch {
        /* best-effort */
      }
      return;
    }

    // Empty message with no recognized payload — log and move on so we
    // don't keep getting woken up by it.
    log.debug('Delta-Chat: empty/unhandled message ignored', { msgId, viewType: msg.viewType });
    try {
      await dc.rpc.markseenMsgs(accountId, [msgId]);
    } catch {
      /* best-effort */
    }
  }

  async function spawnRpcServer(): Promise<void> {
    proc = spawn(config.rpcServerPath, [], {
      env: { ...process.env, DC_ACCOUNTS_PATH: config.accountsDir, RUST_LOG: process.env.RUST_LOG || 'info' },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessByStdio<Writable, Readable, Readable>;
    proc.on('error', (err) => {
      log.error('Delta-Chat rpc-server spawn error', { err });
    });
    proc.on('exit', (code, signal) => {
      log.warn('Delta-Chat rpc-server exited', { code, signal });
      connected = false;
      // Drop any pending stability-reset; the connection it was guarding is
      // gone. A fresh timer is armed once we reconnect.
      if (stabilityResetTimer) {
        clearTimeout(stabilityResetTimer);
        stabilityResetTimer = null;
      }
      if (teardownRequested) return;
      void attemptRespawn();
    });
    // rpc-server logs to stderr — surface as info so journalctl picks it up.
    proc.stderr.on('data', (buf: Buffer) => {
      const line = buf.toString().trimEnd();
      if (line) log.debug('Delta-Chat rpc-server', { line });
    });
    dc = new StdioDeltaChat(proc.stdin, proc.stdout, /* startEventLoop */ true);
  }

  // Named so it can be re-attached after a respawn without duplicating the
  // body. Captures `dc`/`ourAccountId` via closure on each call so a fresh
  // StdioDeltaChat instance after respawn picks up the latest references.
  function handleIncomingMsg(eventAccountId: number, event: DcEventType<'IncomingMsg'>): void {
    if (eventAccountId !== ourAccountId) return;
    handleIncoming(eventAccountId, event.chatId, event.msgId).catch((err) => {
      log.error('Delta-Chat: handleIncoming threw', { msgId: event.msgId, err });
    });
  }

  // Spawn the rpc-server, discover the account, start IO, attach event
  // handler. Used by both initial setup() and attemptRespawn() so the wiring
  // stays in one place.
  async function connectRpc(): Promise<void> {
    await spawnRpcServer();
    if (!dc) throw new Error('Delta-Chat: dc initialization failed');
    ourAccountId = await discoverAccount();
    await dc.rpc.startIo(ourAccountId);
    dc.on('IncomingMsg', handleIncomingMsg);
    connected = true;
  }

  async function attemptRespawn(): Promise<void> {
    if (respawnInFlight || teardownRequested) return;
    respawnInFlight = true;
    try {
      while (!teardownRequested) {
        const delay = computeRespawnDelay(respawnAttempts);
        respawnAttempts += 1;
        log.info('Delta-Chat rpc-server respawn scheduled', {
          attempt: respawnAttempts,
          delayMs: delay,
        });
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        if (teardownRequested) return;
        try {
          await connectRpc();
          log.info('Delta-Chat rpc-server respawned', {
            attempt: respawnAttempts,
            accountId: ourAccountId,
          });
          // Arm the stability-reset: if we stay connected long enough, zero
          // the counter so the next isolated crash starts fast again.
          stabilityResetTimer = setTimeout(() => {
            if (connected) {
              respawnAttempts = 0;
              log.debug('Delta-Chat respawn attempt counter reset (stable)');
            }
            stabilityResetTimer = null;
          }, RESPAWN_STABILITY_RESET_MS);
          return;
        } catch (err) {
          log.error('Delta-Chat rpc-server respawn failed', {
            attempt: respawnAttempts,
            err,
          });
          if (respawnAttempts >= MAX_RESPAWN_ATTEMPTS) {
            log.error('Delta-Chat rpc-server: giving up after max attempts', {
              maxAttempts: MAX_RESPAWN_ATTEMPTS,
            });
            return;
          }
          // Loop will compute the next backoff slot and try again.
        }
      }
    } finally {
      respawnInFlight = false;
    }
  }

  async function discoverAccount(): Promise<number> {
    if (!dc) throw new Error('dc not initialized');
    const accounts = await dc.rpc.getAllAccounts();
    for (const acc of accounts) {
      if (acc.kind === 'Configured') return acc.id;
    }
    throw new Error(
      `No configured Delta-Chat account in ${config.accountsDir} — run setup/channels/deltachat.ts first to bootstrap one.`,
    );
  }

  async function sendText(chatId: number, text: string): Promise<void> {
    if (!dc || ourAccountId === null) return;
    const chunks = chunkText(text, DELTACHAT_CHUNK_MAX, DELTACHAT_MAX_LINES);
    for (let i = 0; i < chunks.length; i++) {
      try {
        await dc.rpc.miscSendMsg(ourAccountId, chatId, chunks[i]!, null, null, null, null);
      } catch (err) {
        log.error('Delta-Chat: sendText failed', { chatId, err });
        return;
      }
      if (chunks.length > 1 && i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
      }
    }
  }

  async function persistOutboundFile(file: OutboundFile): Promise<string> {
    const safeExt = extname(file.filename || '').replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const path = join(config.attachmentsOutDir, `opj1-out-${stamp}${safeExt}`);
    await mkdir(config.attachmentsOutDir, { recursive: true });
    await writeFile(path, file.data);
    return path;
  }

  async function sendFile(chatId: number, file: OutboundFile): Promise<void> {
    if (!dc || ourAccountId === null) return;
    if (file.data.length > MAX_OUTBOUND_FILE_BYTES) {
      await sendText(
        chatId,
        `[Outbound-Datei '${file.filename}' ist mit ${Math.floor(
          file.data.length / 1_000_000,
        )} MB zu gross (Limit ${Math.floor(MAX_OUTBOUND_FILE_BYTES / 1_000_000)} MB).]`,
      );
      return;
    }
    const persisted = await persistOutboundFile(file);
    const viewType = viewtypeForOutbound(file.filename, file.data.length);
    try {
      // miscSendMsg implicitly picks viewtype from file extension; setting
      // a draft first lets us force viewtype for the Voice/Audio split. For
      // images and plain files the default works fine, so we only override
      // when audio-shaped.
      if (viewType === 'Voice' || viewType === 'Audio') {
        await dc.rpc.miscSetDraft(ourAccountId, chatId, null, persisted, file.filename, null, viewType);
        await dc.rpc.miscSendDraft(ourAccountId, chatId);
      } else {
        await dc.rpc.miscSendMsg(ourAccountId, chatId, null, persisted, file.filename, null, null);
      }
      log.info('Delta-Chat file sent', { chatId, filename: file.filename, viewType, bytes: file.data.length });
    } catch (err) {
      log.error('Delta-Chat sendFile failed', { chatId, filename: file.filename, err });
    } finally {
      // Delta-Chat copies the file into its blobdir on send, so we can
      // remove the staging copy right away.
      await rm(persisted, { force: true }).catch(() => {
        /* best-effort */
      });
    }
  }

  const adapter: ChannelAdapter = {
    name: 'deltachat',
    channelType: 'deltachat',
    supportsThreads: false,

    async setup(cfg: ChannelSetup): Promise<void> {
      setup = cfg;
      teardownRequested = false;
      respawnAttempts = 0;
      await mkdir(config.accountsDir, { recursive: true });
      await mkdir(config.attachmentsInDir, { recursive: true });
      await mkdir(config.attachmentsOutDir, { recursive: true });
      // TTL cleanup at startup — keeps disk usage bounded even if the
      // adapter restarts often. Best-effort: errors are swallowed.
      cleanupOldAttachments(config.attachmentsInDir, ATTACHMENT_TTL_MS).catch(() => undefined);
      cleanupOldAttachments(config.attachmentsOutDir, ATTACHMENT_TTL_MS).catch(() => undefined);

      await connectRpc();
      log.info('Delta-Chat channel connected', {
        accountId: ourAccountId,
        accountsDir: config.accountsDir,
        allowedContacts: [...config.allowedContactIds],
      });
    },

    async teardown(): Promise<void> {
      // Set the guard first so an in-flight respawn aborts and the exit
      // handler that fires from our own SIGTERM below doesn't relaunch.
      teardownRequested = true;
      if (stabilityResetTimer) {
        clearTimeout(stabilityResetTimer);
        stabilityResetTimer = null;
      }
      connected = false;
      if (dc && ourAccountId !== null) {
        try {
          await dc.rpc.stopIo(ourAccountId);
        } catch {
          /* best-effort */
        }
      }
      if (dc) {
        try {
          dc.close();
        } catch {
          /* best-effort */
        }
      }
      if (proc) {
        try {
          proc.kill('SIGTERM');
        } catch {
          /* best-effort */
        }
      }
      dc = null;
      proc = null;
      ourAccountId = null;
      log.info('Delta-Chat channel disconnected');
    },

    isConnected(): boolean {
      return connected;
    },

    async deliver(platformId: string, _threadId: string | null, message: OutboundMessage): Promise<string | undefined> {
      if (!dc || ourAccountId === null) {
        log.warn('Delta-Chat deliver called before adapter ready', { platformId });
        return undefined;
      }
      const contactIdStr = platformId.startsWith(PLATFORM_PREFIX)
        ? platformId.slice(PLATFORM_PREFIX.length)
        : platformId;
      const contactId = Number(contactIdStr);
      if (!Number.isInteger(contactId)) {
        log.warn('Delta-Chat deliver: invalid platformId', { platformId });
        return undefined;
      }
      let chatId: number;
      try {
        chatId = await dc.rpc.createChatByContactId(ourAccountId, contactId);
      } catch (err) {
        log.error('Delta-Chat deliver: createChatByContactId failed', { contactId, err });
        return undefined;
      }
      const content = message.content as Record<string, unknown> | string | undefined;
      let text: string | null = null;
      if (typeof content === 'string') {
        text = content;
      } else if (content && typeof content === 'object' && typeof content.text === 'string') {
        text = content.text;
      }
      if (text) await sendText(chatId, text);
      for (const file of message.files ?? []) {
        await sendFile(chatId, file);
      }
      return undefined;
    },
  };

  return adapter;
}

// ---------------------------------------------------------------------------
// Self-registration
// ---------------------------------------------------------------------------

const DEFAULT_RPC_SERVER_PATH = `${process.env.HOME ?? '/home/opj1claw'}/.local/bin/deltachat-rpc-server`;
const DEFAULT_ACCOUNTS_DIR = `${process.env.HOME ?? '/home/opj1claw'}/.deltachat-data/accounts`;
const DEFAULT_ATTACHMENTS_IN_DIR = `${process.env.HOME ?? '/home/opj1claw'}/.deltachat-data/attachments-in`;
const DEFAULT_ATTACHMENTS_OUT_DIR = `${process.env.HOME ?? '/home/opj1claw'}/.deltachat-data/attachments-out`;
const DEFAULT_STT_URL = 'http://127.0.0.1:8384/transcribe';
const DEFAULT_STT_LANGUAGE = 'de';
const DEFAULT_STT_TIMEOUT_MS = 60_000;

registerChannelAdapter('deltachat', {
  factory: () => {
    const envVars = readEnvFile([
      'DELTACHAT_RPC_SERVER_PATH',
      'DELTACHAT_ACCOUNTS_DIR',
      'DELTACHAT_ATTACHMENTS_DIR',
      'DELTACHAT_OUTBOX_DIR',
      'DELTACHAT_ALLOWED_CONTACT_IDS',
      'DELTACHAT_VOICE_STT_URL',
      'DELTACHAT_VOICE_STT_LANGUAGE',
      'DELTACHAT_VOICE_STT_TIMEOUT_MS',
      'WHISPER_URL',
    ]);
    const allowedRaw = process.env.DELTACHAT_ALLOWED_CONTACT_IDS || envVars.DELTACHAT_ALLOWED_CONTACT_IDS || '';
    const allowedContactIds = new Set<number>();
    for (const raw of allowedRaw.split(',')) {
      const id = parseInt(raw.trim(), 10);
      if (Number.isInteger(id) && id > 0) allowedContactIds.add(id);
    }
    if (allowedContactIds.size === 0) {
      log.debug('Delta-Chat: DELTACHAT_ALLOWED_CONTACT_IDS not set, skipping channel');
      return null;
    }
    const rpcServerPath =
      process.env.DELTACHAT_RPC_SERVER_PATH || envVars.DELTACHAT_RPC_SERVER_PATH || DEFAULT_RPC_SERVER_PATH;
    const accountsDir = process.env.DELTACHAT_ACCOUNTS_DIR || envVars.DELTACHAT_ACCOUNTS_DIR || DEFAULT_ACCOUNTS_DIR;
    const attachmentsInDir =
      process.env.DELTACHAT_ATTACHMENTS_DIR || envVars.DELTACHAT_ATTACHMENTS_DIR || DEFAULT_ATTACHMENTS_IN_DIR;
    const attachmentsOutDir =
      process.env.DELTACHAT_OUTBOX_DIR || envVars.DELTACHAT_OUTBOX_DIR || DEFAULT_ATTACHMENTS_OUT_DIR;
    const sttUrl =
      process.env.DELTACHAT_VOICE_STT_URL ||
      envVars.DELTACHAT_VOICE_STT_URL ||
      process.env.WHISPER_URL ||
      envVars.WHISPER_URL ||
      DEFAULT_STT_URL;
    const sttLanguage =
      process.env.DELTACHAT_VOICE_STT_LANGUAGE || envVars.DELTACHAT_VOICE_STT_LANGUAGE || DEFAULT_STT_LANGUAGE;
    const sttTimeoutMs = parseInt(
      process.env.DELTACHAT_VOICE_STT_TIMEOUT_MS ||
        envVars.DELTACHAT_VOICE_STT_TIMEOUT_MS ||
        String(DEFAULT_STT_TIMEOUT_MS),
      10,
    );
    // When the agent runs in a container (the default for NanoClaw),
    // the host attachments dir is mounted under containerConfig.mounts.
    // The default matches the `containerPath` on the mount declaration below.
    const agentAttachmentsPath =
      process.env.DELTACHAT_AGENT_ATTACHMENTS_PATH ||
      envVars.DELTACHAT_AGENT_ATTACHMENTS_PATH ||
      '/workspace/extra/deltachat-attachments';
    return createDeltachatAdapter({
      rpcServerPath,
      accountsDir,
      attachmentsInDir,
      attachmentsOutDir,
      allowedContactIds,
      sttUrl,
      sttLanguage,
      sttTimeoutMs,
      agentAttachmentsPath: agentAttachmentsPath || null,
    });
  },
  // Container-runner does not yet honor channel-level mounts (only provider
  // contributions feed buildMounts as of v2.0.61), but declaring them here
  // documents the intent: agent containers need read access to inbound
  // attachments to actually use them. Until container-runner threads this
  // through, the per-agent-group container.json must be patched manually
  // (`ncl groups config update --add-mount ...`) on first deploy.
  containerConfig: {
    mounts: [
      {
        hostPath: `${process.env.HOME ?? '/home/opj1claw'}/.deltachat-data/attachments-in`,
        // NanoClaw's container-runner mounts additionalMounts under
        // `/workspace/extra/<containerPath>` — keep this in sync with the
        // default of DELTACHAT_AGENT_ATTACHMENTS_PATH so the path the
        // adapter writes into the prompt actually resolves on disk.
        containerPath: 'deltachat-attachments',
        readonly: true,
      },
    ],
  },
});
