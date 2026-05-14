/**
 * SimpleX channel adapter for NanoClaw v2.
 *
 * Talks to a local simplex-chat daemon over its WebSocket control protocol.
 * The daemon is started independently as a systemd-user service (see
 * `~/.config/systemd/user/opj1-simplex-daemon.service`) — this adapter
 * connects to its existing socket, never spawns it.
 *
 * Inbound: subscribes to `newChatItems`, forwards text from DM contacts
 *   present in the SIMPLEX_ALLOWED_CONTACT_IDS allowlist.
 * Outbound: `/_send @<contactId> text <chunk>` JSON-RPC commands, with
 *   chunked text for messages > SIMPLEX_CHUNK_MAX.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readEnvFile } from '../env.js';
import { log } from '../log.js';
import { registerChannelAdapter } from './channel-registry.js';
import type { ChannelAdapter, ChannelSetup, InboundMessage, OutboundMessage } from './adapter.js';

const SIMPLEX_CHUNK_MAX = 2000;
// 200ms inter-chunk pacing: the local daemon accepts bursts, but chunks
// can otherwise arrive at the recipient out of order on flaky network paths.
const SEND_DELAY_MS = 200;
const RPC_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 10_000;
const PLATFORM_PREFIX = 'simplex:';

// SimpleX protocol event-type strings — keep in one place so a daemon
// schema bump only touches this block.
const EVT_NEW_CHAT_ITEMS = 'newChatItems';
const EVT_RCV_FILE_COMPLETE = 'rcvFileComplete';
const EVT_CHAT_CMD_ERROR = 'chatCmdError';
const CHAT_INFO_DIRECT = 'direct';
const CHAT_DIR_RECEIVE = 'directRcv';
const CONTENT_RECEIVED = 'rcvMsgContent';
const MSG_TYPE_TEXT = 'text';
const MSG_TYPE_VOICE = 'voice';

// Voice-note constraints (mirrors Pi-Bridge defaults).
const MAX_VOICE_BYTES = 25 * 1024 * 1024;
const PENDING_VOICE_TTL_MS = 5 * 60 * 1000;

interface SimplexAdapterConfig {
  wsUrl: string;
  allowedContactIds: Set<string>;
  filesFolder: string;
  sttUrl: string;
  sttLanguage: string;
  sttTimeoutMs: number;
}

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingVoice {
  contactId: string;
  senderName: string;
  fileName: string;
  ts: number;
}

function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let splitAt = rest.lastIndexOf('\n', limit);
    if (splitAt <= 0) splitAt = limit;
    chunks.push(rest.slice(0, splitAt));
    rest = rest.slice(splitAt).replace(/^\n/, '');
  }
  if (rest) chunks.push(rest);
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
    // Force a generic filename so the STT server's content-sniffing isn't
    // confused by SimpleX's "voice_YYYYMMDD_HHMMSS.m4a" pattern.
    form.append('file', new Blob([new Uint8Array(buf)], { type: 'audio/mp4' }), 'voice.m4a');
    form.append('language', language);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(sttUrl, { method: 'POST', body: form, signal: ctrl.signal });
      if (!res.ok) {
        log.warn('SimpleX STT: non-OK response', { status: res.status, sttUrl });
        return null;
      }
      const json = (await res.json()) as { text?: string };
      const text = (json.text ?? '').trim();
      return text || null;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    log.warn('SimpleX STT: call failed', { sttUrl, err });
    return null;
  }
}

function createSimplexAdapter(config: SimplexAdapterConfig): ChannelAdapter {
  let ws: WebSocket | null = null;
  let setup: ChannelSetup | null = null;
  let corrCounter = 0;
  const pending = new Map<string, PendingRpc>();
  const pendingVoices = new Map<number, PendingVoice>();

  function evictStaleVoices(): void {
    const now = Date.now();
    const stale: number[] = [];
    for (const [fileId, p] of pendingVoices) {
      if (now - p.ts > PENDING_VOICE_TTL_MS) stale.push(fileId);
    }
    for (const fileId of stale) {
      pendingVoices.delete(fileId);
      log.warn('SimpleX: evicting stale pending voice', { fileId });
    }
  }

  function isWsOpen(): boolean {
    return ws !== null && ws.readyState === WebSocket.OPEN;
  }

  function nextCorr(): string {
    corrCounter += 1;
    return `s${corrCounter}`;
  }

  async function rpc(cmd: string, timeoutMs = RPC_TIMEOUT_MS): Promise<unknown> {
    if (!isWsOpen()) {
      throw new Error('SimpleX WS not connected');
    }
    const corr = nextCorr();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(corr);
        reject(new Error(`SimpleX RPC timeout: ${cmd.slice(0, 40)}`));
      }, timeoutMs);
      pending.set(corr, { resolve, reject, timer });
      ws!.send(JSON.stringify({ corrId: corr, cmd }));
    });
  }

  function emitInbound(contactId: string, senderName: string, itemId: string, text: string, ts: string): void {
    const platformId = `${PLATFORM_PREFIX}${contactId}`;
    const inbound: InboundMessage = {
      id: itemId,
      kind: 'chat',
      content: {
        text,
        sender: contactId,
        senderId: platformId,
        senderName,
      },
      timestamp: ts,
    };
    void setup?.onInbound(platformId, null, inbound);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleNewChatItem(item: any): void {
    const chatInfo = item.chatInfo;
    // Phase 1: DMs only. Group support can come later.
    if (chatInfo?.type !== CHAT_INFO_DIRECT) return;
    const contact = chatInfo.contact;
    if (!contact) return;
    const contactId = String(contact.contactId);
    if (!config.allowedContactIds.has(contactId)) {
      log.debug('SimpleX: dropping message from non-allowlisted contact', { contactId });
      return;
    }
    const chatItem = item.chatItem;
    // Skip our own sent messages (chatDir.type === 'directSnd').
    if (chatItem?.chatDir?.type !== CHAT_DIR_RECEIVE) return;
    const content = chatItem.content;
    if (content?.type !== CONTENT_RECEIVED) return;
    const msgContent = content.msgContent;
    const senderName: string = contact.localDisplayName || contact.profile?.displayName || `contact-${contactId}`;
    const itemId = String(chatItem.meta?.itemId ?? Date.now());
    const itemTs = chatItem.meta?.itemTs || new Date().toISOString();

    if (msgContent?.type === MSG_TYPE_TEXT) {
      const text: string = msgContent.text || '';
      if (!text.trim()) return;
      emitInbound(contactId, senderName, itemId, text, itemTs);
      log.info('SimpleX message received', {
        platformId: `${PLATFORM_PREFIX}${contactId}`,
        senderName,
        len: text.length,
      });
      return;
    }

    if (msgContent?.type === MSG_TYPE_VOICE) {
      const file = chatItem.file;
      const fileId: number | undefined = file?.fileId;
      const fileName: string | undefined = file?.fileName;
      const fileSize: number = file?.fileSize ?? 0;
      if (typeof fileId !== 'number' || !fileName) {
        log.warn('SimpleX voice: missing fileId or fileName', { contactId });
        return;
      }
      if (fileSize > MAX_VOICE_BYTES) {
        log.warn('SimpleX voice: file too large, rejecting', { contactId, fileSize });
        emitInbound(contactId, senderName, itemId, '[Voice abgelehnt: Datei zu groß]', itemTs);
        return;
      }
      evictStaleVoices();
      pendingVoices.set(fileId, { contactId, senderName, fileName, ts: Date.now() });
      // Auto-accept the file so XFTP starts downloading. Fire-and-forget — if
      // /fr fails we'll see it in logs and the rcvFileComplete will never
      // arrive, which TTL-eviction cleans up after 5 min.
      rpc(`/fr ${fileId}`).catch((err) => {
        log.warn('SimpleX voice: auto-accept (/fr) failed', { fileId, err });
        pendingVoices.delete(fileId);
      });
      log.info('SimpleX voice received', {
        platformId: `${PLATFORM_PREFIX}${contactId}`,
        senderName,
        fileId,
        fileName,
        fileSize,
      });
      return;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleVoiceComplete(resp: any): Promise<void> {
    // SimpleX nests payload as resp.chatItem.chatItem.file (not single-level
    // like newChatItems). See Pi-Bridge bridge.py:321-329 for the same dance.
    const fileInfo = resp?.chatItem?.chatItem?.file;
    const fileId: number | undefined = fileInfo?.fileId;
    if (typeof fileId !== 'number') return;
    evictStaleVoices();
    const pendingVoice = pendingVoices.get(fileId);
    if (!pendingVoice) {
      // No matching pending voice — either from a non-allowlisted sender
      // (allowlist guard via Map membership) or already processed.
      log.debug('SimpleX: rcvFileComplete for unknown fileId', { fileId });
      return;
    }
    pendingVoices.delete(fileId);
    // Prefer the server-provided file path when available; fall back to
    // joining with the configured files folder.
    const relPath: string | undefined = fileInfo?.fileSource?.filePath;
    const filePath = relPath ? join(config.filesFolder, relPath) : join(config.filesFolder, pendingVoice.fileName);
    const transcript = await transcribeAudio(filePath, config.sttUrl, config.sttLanguage, config.sttTimeoutMs);
    const text = transcript ? `[Voice] ${transcript}` : '[Voice konnte nicht transkribiert werden]';
    emitInbound(pendingVoice.contactId, pendingVoice.senderName, `voice-${fileId}`, text, new Date().toISOString());
    log.info('SimpleX voice transcribed', {
      platformId: `${PLATFORM_PREFIX}${pendingVoice.contactId}`,
      fileId,
      ok: transcript !== null,
      len: transcript?.length ?? 0,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleEvent(data: any): void {
    const resp = data.resp;
    if (!resp) return;
    if (resp.type === EVT_NEW_CHAT_ITEMS) {
      const items = resp.chatItems || [];
      for (const item of items) handleNewChatItem(item);
      return;
    }
    if (resp.type === EVT_RCV_FILE_COMPLETE) {
      void handleVoiceComplete(resp);
      return;
    }
  }

  function connectWs(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const sock = new WebSocket(config.wsUrl);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('SimpleX WS connect timeout'));
        try {
          sock.close();
        } catch {
          /* ignore */
        }
      }, CONNECT_TIMEOUT_MS);

      sock.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws = sock;
        resolve();
      });

      sock.addEventListener('error', (ev) => {
        if (settled) {
          // Error after open: a `close` event is guaranteed to follow per
          // WebSocket spec. The close handler is the single state-cleanup
          // path; we just log here.
          log.warn('SimpleX WS error', { ev: String((ev as Event).type) });
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(new Error('SimpleX WS error'));
      });

      sock.addEventListener('close', () => {
        const wasConnected = ws === sock;
        ws = null;
        for (const [, p] of pending) {
          clearTimeout(p.timer);
          p.reject(new Error('SimpleX WS closed'));
        }
        pending.clear();
        if (wasConnected) {
          log.warn('SimpleX channel lost WebSocket connection', { wsUrl: config.wsUrl });
        }
      });

      sock.addEventListener('message', (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : '';
        if (!raw) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any;
        try {
          data = JSON.parse(raw);
        } catch {
          log.debug('SimpleX WS: unparseable frame', { snippet: raw.slice(0, 200) });
          return;
        }

        // RPC response routing
        if (data.corrId && pending.has(data.corrId)) {
          const p = pending.get(data.corrId)!;
          pending.delete(data.corrId);
          clearTimeout(p.timer);
          if (data.resp?.type === EVT_CHAT_CMD_ERROR) {
            const err = data.resp.chatError || data.resp;
            p.reject(new Error(`SimpleX RPC error: ${JSON.stringify(err).slice(0, 200)}`));
          } else {
            p.resolve(data.resp);
          }
          return;
        }

        // Push event
        try {
          handleEvent(data);
        } catch (err) {
          log.error('SimpleX event-handler error', { err });
        }
      });
    });
  }

  async function sendText(contactId: string, text: string): Promise<void> {
    const chunks = chunkText(text, SIMPLEX_CHUNK_MAX);
    for (const chunk of chunks) {
      const cmd = `/_send @${contactId} text ${chunk}`;
      try {
        await rpc(cmd);
      } catch (err) {
        log.error('SimpleX: send failed', { contactId, err });
        return;
      }
      if (chunks.length > 1) {
        await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
      }
    }
  }

  const adapter: ChannelAdapter = {
    name: 'simplex',
    channelType: 'simplex',
    supportsThreads: false,

    async setup(cfg: ChannelSetup): Promise<void> {
      setup = cfg;
      await connectWs();
      log.info('SimpleX channel connected', {
        wsUrl: config.wsUrl,
        allowedContacts: [...config.allowedContactIds],
      });
    },

    async teardown(): Promise<void> {
      if (isWsOpen()) {
        ws!.close();
      }
      ws = null;
      log.info('SimpleX channel disconnected');
    },

    isConnected(): boolean {
      return isWsOpen();
    },

    async deliver(platformId: string, _threadId: string | null, message: OutboundMessage): Promise<string | undefined> {
      const contactId = platformId.startsWith(PLATFORM_PREFIX) ? platformId.slice(PLATFORM_PREFIX.length) : platformId;
      const content = message.content as Record<string, unknown> | string | undefined;
      let text: string | null = null;
      if (typeof content === 'string') {
        text = content;
      } else if (content && typeof content === 'object' && typeof content.text === 'string') {
        text = content.text;
      }
      if (text) await sendText(contactId, text);
      return undefined;
    },
  };

  return adapter;
}

// ---------------------------------------------------------------------------
// Self-registration
// ---------------------------------------------------------------------------

const DEFAULT_WS_URL = 'ws://127.0.0.1:5226';
const DEFAULT_FILES_FOLDER = '/home/opj1claw/.simplex/files';
const DEFAULT_STT_URL = 'http://127.0.0.1:8384/transcribe';
const DEFAULT_STT_LANGUAGE = 'de';
const DEFAULT_STT_TIMEOUT_MS = 30_000;

registerChannelAdapter('simplex', {
  factory: () => {
    const envVars = readEnvFile([
      'SIMPLEX_WS_URL',
      'SIMPLEX_ALLOWED_CONTACT_IDS',
      'SIMPLEX_FILES_FOLDER',
      'SIMPLEX_VOICE_STT_URL',
      'SIMPLEX_VOICE_STT_LANGUAGE',
      'SIMPLEX_VOICE_STT_TIMEOUT_MS',
      'WHISPER_URL',
    ]);
    const wsUrl = process.env.SIMPLEX_WS_URL || envVars.SIMPLEX_WS_URL || DEFAULT_WS_URL;
    const allowedRaw = process.env.SIMPLEX_ALLOWED_CONTACT_IDS || envVars.SIMPLEX_ALLOWED_CONTACT_IDS || '';
    const allowedContactIds = new Set(
      allowedRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (allowedContactIds.size === 0) {
      log.debug('SimpleX: SIMPLEX_ALLOWED_CONTACT_IDS not set, skipping channel');
      return null;
    }
    const filesFolder = process.env.SIMPLEX_FILES_FOLDER || envVars.SIMPLEX_FILES_FOLDER || DEFAULT_FILES_FOLDER;
    const sttUrl =
      process.env.SIMPLEX_VOICE_STT_URL ||
      envVars.SIMPLEX_VOICE_STT_URL ||
      process.env.WHISPER_URL ||
      envVars.WHISPER_URL ||
      DEFAULT_STT_URL;
    const sttLanguage =
      process.env.SIMPLEX_VOICE_STT_LANGUAGE || envVars.SIMPLEX_VOICE_STT_LANGUAGE || DEFAULT_STT_LANGUAGE;
    const sttTimeoutMs = parseInt(
      process.env.SIMPLEX_VOICE_STT_TIMEOUT_MS ||
        envVars.SIMPLEX_VOICE_STT_TIMEOUT_MS ||
        String(DEFAULT_STT_TIMEOUT_MS),
      10,
    );
    return createSimplexAdapter({
      wsUrl,
      allowedContactIds,
      filesFolder,
      sttUrl,
      sttLanguage,
      sttTimeoutMs,
    });
  },
});
