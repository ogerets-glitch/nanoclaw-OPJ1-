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
const EVT_CHAT_CMD_ERROR = 'chatCmdError';
const CHAT_INFO_DIRECT = 'direct';
const CHAT_DIR_RECEIVE = 'directRcv';
const CONTENT_RECEIVED = 'rcvMsgContent';
const MSG_TYPE_TEXT = 'text';

interface SimplexAdapterConfig {
  wsUrl: string;
  allowedContactIds: Set<string>;
}

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
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

function createSimplexAdapter(config: SimplexAdapterConfig): ChannelAdapter {
  let ws: WebSocket | null = null;
  let setup: ChannelSetup | null = null;
  let corrCounter = 0;
  const pending = new Map<string, PendingRpc>();

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleEvent(data: any): void {
    const resp = data.resp;
    if (!resp || resp.type !== EVT_NEW_CHAT_ITEMS) return;
    const items = resp.chatItems || [];
    for (const item of items) {
      const chatInfo = item.chatInfo;
      // Phase 1: DMs only. Group support can come later.
      if (chatInfo?.type !== CHAT_INFO_DIRECT) continue;
      const contact = chatInfo.contact;
      if (!contact) continue;
      const contactId = String(contact.contactId);
      if (!config.allowedContactIds.has(contactId)) {
        log.debug('SimpleX: dropping message from non-allowlisted contact', { contactId });
        continue;
      }
      const chatItem = item.chatItem;
      // Skip our own sent messages (chatDir.type === 'directSnd').
      if (chatItem?.chatDir?.type !== CHAT_DIR_RECEIVE) continue;
      const content = chatItem.content;
      if (content?.type !== CONTENT_RECEIVED) continue;
      const msgContent = content.msgContent;
      if (msgContent?.type !== MSG_TYPE_TEXT) continue;
      const text: string = msgContent.text || '';
      if (!text.trim()) continue;
      const platformId = `${PLATFORM_PREFIX}${contactId}`;
      const senderName: string = contact.localDisplayName || contact.profile?.displayName || `contact-${contactId}`;
      const inbound: InboundMessage = {
        id: String(chatItem.meta?.itemId ?? Date.now()),
        kind: 'chat',
        content: {
          text,
          sender: contactId,
          senderId: platformId,
          senderName,
        },
        timestamp: chatItem.meta?.itemTs || new Date().toISOString(),
      };
      void setup?.onInbound(platformId, null, inbound);
      log.info('SimpleX message received', { platformId, senderName, len: text.length });
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

registerChannelAdapter('simplex', {
  factory: () => {
    const envVars = readEnvFile(['SIMPLEX_WS_URL', 'SIMPLEX_ALLOWED_CONTACT_IDS']);
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
    return createSimplexAdapter({ wsUrl, allowedContactIds });
  },
});
