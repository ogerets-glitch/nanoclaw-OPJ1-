/**
 * Image search + download MCP tools.
 *
 * Why: Anthropic's built-in WebFetch returns image-content-blocks for
 * image URLs. If the bytes are not parseable by the API, every
 * subsequent turn replays the broken image and the session 400-loops.
 * These tools give the agent a safe path: search images (text-only
 * results), download to a local file with magic-bytes validation, then
 * use the existing send_file tool to ship the file to the user. The
 * downloaded bytes never travel through the conversation history.
 *
 * Backed by SearXNG (local, no API key) at http://172.17.0.1:8888.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { registerTools } from './server.js';
import type { McpToolDefinition } from './types.js';

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://172.17.0.1:8888';
const CACHE_DIR = process.env.IMAGE_CACHE_DIR || '/workspace/agent/.image-cache';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — Anthropic image limit, also reasonable for Telegram photos
const FETCH_TIMEOUT_MS = 15000;
const SEARCH_TIMEOUT_MS = 10000;
const CACHE_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // 1 h
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h — covers crash-leaked files; SessionEnd handles the graceful path

let lastSweepAt = 0;

function log(msg: string): void {
  console.error(`[mcp-tools] ${msg}`);
}

// Returns a reason string if the URL targets a private/loopback host or
// non-http(s) scheme, null otherwise. Used at the download_image entry
// and after each manual redirect.
function blockedHost(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http(s) URLs allowed.';
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
    host === '::1' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc00:') ||
    host.startsWith('fd')
  ) {
    return `Private/loopback host not allowed: ${parsed.hostname}`;
  }
  return null;
}

// Fetch that follows redirects manually, re-validating every hop against
// blockedHost(). Caps at 5 hops, same as the Node default.
async function fetchFollowingPublicRedirects(url: string): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
    });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    const next = new URL(location, current).toString();
    const blocked = blockedHost(next);
    if (blocked) throw new Error(`Redirect to disallowed host blocked: ${blocked}`);
    current = next;
  }
  throw new Error('Too many redirects (>5)');
}

// Opportunistic sweep: drops cache entries older than CACHE_TTL_MS. Cheap
// and rate-limited; only protects against the crash/SIGKILL case where the
// SessionEnd hook never fires.
function sweepStaleCache(): void {
  const now = Date.now();
  if (now - lastSweepAt < CACHE_SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  let entries: string[];
  try {
    entries = fs.readdirSync(CACHE_DIR);
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = path.join(CACHE_DIR, entry);
    try {
      const st = fs.statSync(p);
      if (now - st.mtimeMs > CACHE_TTL_MS) fs.unlinkSync(p);
    } catch {
      /* best-effort */
    }
  }
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${text}` }], isError: true };
}

interface SearxngResult {
  img_src?: string;
  title?: string;
  resolution?: string;
  filesize?: string | null;
  source?: string;
}

interface ImageHit {
  url: string;
  title: string;
  resolution: string;
  source: string;
}

type ImageFormat = 'jpeg' | 'png' | 'gif' | 'webp';

function detectImageFormat(buf: Buffer): ImageFormat | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }
  // GIF: 47 49 46 38 (37|39) 61
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return 'gif';
  }
  // WebP: 'RIFF' …4 bytes… 'WEBP'
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export const searchImages: McpToolDefinition = {
  tool: {
    name: 'search_images',
    description:
      'Search the web for real images via SearXNG (multi-engine, no API key). Returns a list of image URLs with title, resolution, and source domain — purely textual, no bytes enter the conversation. Use this instead of WebFetch on image URLs. Workflow: search_images → pick a hit → download_image → send_file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query, e.g. "Eiffel Tower at night"' },
        max_results: {
          type: 'integer',
          description: 'How many hits to return (default 5, max 10).',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['query'],
    },
  },
  async handler(args) {
    const query = (args.query as string | undefined)?.trim();
    if (!query) return err('query is required');
    const maxResults = Math.min(Math.max(Number(args.max_results) || 5, 1), 10);

    const params = new URLSearchParams({
      q: query,
      categories: 'images',
      format: 'json',
      safesearch: '1',
    });

    let json: { results?: SearxngResult[] };
    try {
      const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        log(`search_images: SearXNG HTTP ${res.status}`);
        return err(`Bildsuche aktuell nicht verfügbar (SearXNG HTTP ${res.status}).`);
      }
      json = (await res.json()) as { results?: SearxngResult[] };
    } catch (e) {
      log(`search_images: fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      return err('Bildsuche aktuell nicht verfügbar (SearXNG unreachable).');
    }

    const all = json.results ?? [];
    const hits: ImageHit[] = [];
    for (const r of all) {
      if (!r.img_src) continue;
      hits.push({
        url: r.img_src,
        title: r.title ?? '',
        resolution: r.resolution ?? '',
        source: r.source ?? '',
      });
      if (hits.length >= maxResults) break;
    }

    if (hits.length === 0) {
      return err(`No image results for "${query}".`);
    }

    log(`search_images: "${query}" → ${hits.length} hits`);
    return ok(JSON.stringify(hits, null, 2));
  },
};

export const downloadImage: McpToolDefinition = {
  tool: {
    name: 'download_image',
    description:
      'Download an image URL to a local file in /workspace/agent/.image-cache/ with magic-bytes validation (JPEG/PNG/GIF/WebP only) and a 5 MB size cap. Returns the absolute local path so you can pass it to send_file. Fails cleanly on HTML pages, redirects, or oversized files — the broken bytes never reach Claude.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'Image URL (typically from search_images results).' },
        filename: {
          type: 'string',
          description: 'Optional display filename for the saved file (extension is set from detected format).',
        },
      },
      required: ['url'],
    },
  },
  async handler(args) {
    const url = (args.url as string | undefined)?.trim();
    if (!url) return err('url is required');

    // SSRF guard: only public http(s) URLs. Reject loopback / RFC1918 /
    // link-local / host-gateway so a hallucinated or prompt-injected URL
    // can't pivot into internal services (OneCLI gateway 10255, Browser
    // CDP on 172.17.0.1:9222, etc.). Redirects are followed manually so
    // a public URL can't 3xx-pivot to a private one mid-request.
    const blockReason = blockedHost(url);
    if (blockReason) return err(blockReason);

    let res: Response;
    try {
      res = await fetchFollowingPublicRedirects(url);
    } catch (e) {
      log(`download_image: fetch failed for ${url}: ${e instanceof Error ? e.message : String(e)}`);
      return err(`Download failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
    if (!res.ok) {
      return err(`HTTP ${res.status} for ${url}`);
    }

    // Pre-flight Content-Length check
    const cl = res.headers.get('content-length');
    if (cl) {
      const declared = Number(cl);
      if (Number.isFinite(declared) && declared > MAX_BYTES) {
        return err(`Image too large: ${(declared / 1024 / 1024).toFixed(1)} MB > 5 MB limit.`);
      }
    }

    // Streaming read with 5 MB cap
    if (!res.body) return err('Empty response body.');
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.length;
          if (total > MAX_BYTES) {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            return err(`Image exceeds 5 MB while streaming (got ${(total / 1024 / 1024).toFixed(1)} MB).`);
          }
          chunks.push(value);
        }
      }
    } catch (e) {
      return err(`Stream read failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const buf = Buffer.concat(chunks as Uint8Array[], total);
    const format = detectImageFormat(buf);
    if (!format) {
      return err('Downloaded content is not a valid image (magic-bytes mismatch — likely HTML, redirect, or unsupported format).');
    }

    // Ensure cache dir, sweep stale entries, then write
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    sweepStaleCache();
    const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
    const ext = format === 'jpeg' ? 'jpg' : format;
    const baseName = (args.filename as string | undefined)?.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const fileName = baseName ? `${baseName}-${hash}.${ext}` : `${hash}.${ext}`;
    const fullPath = path.join(CACHE_DIR, fileName);
    fs.writeFileSync(fullPath, buf);

    const kb = (buf.length / 1024).toFixed(0);
    log(`download_image: saved ${fullPath} (${kb} KB, ${format})`);
    return ok(`Image saved to ${fullPath} (${kb} KB, ${format}). Now call send_file with this path.`);
  },
};

// Helpers exported for testing.
export const __test = { detectImageFormat };

registerTools([searchImages, downloadImage]);
