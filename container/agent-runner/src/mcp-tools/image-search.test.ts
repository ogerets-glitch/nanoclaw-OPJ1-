/**
 * Tests for image-search MCP tools.
 *
 * Verifies the protection invariants that motivated the module:
 *   1) SearXNG parsing yields only declared fields (no image bytes leak).
 *   2) Magic-bytes validation rejects HTML/garbage masquerading as images.
 *   3) Oversize payloads are aborted before they hit disk.
 *
 * Tests mock global fetch so they don't touch the real SearXNG instance.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Redirect the cache dir to a temp path BEFORE importing the module so
// the module-level constant picks it up. The module reads this env var
// at import time.
const TEST_CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'image-cache-test-'));
process.env.IMAGE_CACHE_DIR = TEST_CACHE_DIR;

const { searchImages, downloadImage, __test } = await import('./image-search.js');

const { detectImageFormat } = __test;

const realFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
let nextResponse: (input: { url: string }) => Response | Promise<Response> = () => new Response('', { status: 500 });

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ url, init });
    return nextResponse({ url });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('detectImageFormat', () => {
  it('detects JPEG magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectImageFormat(buf)).toBe('jpeg');
  });

  it('detects PNG magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(detectImageFormat(buf)).toBe('png');
  });

  it('detects GIF87a and GIF89a magic bytes', () => {
    const g87 = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0, 0, 0, 0, 0]);
    const g89 = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    expect(detectImageFormat(g87)).toBe('gif');
    expect(detectImageFormat(g89)).toBe('gif');
  });

  it('detects WebP magic bytes', () => {
    const buf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageFormat(buf)).toBe('webp');
  });

  it('rejects HTML masquerading as image', () => {
    const buf = Buffer.from('<!DOCTYPE html><html><body>', 'utf-8');
    expect(detectImageFormat(buf)).toBeNull();
  });

  it('rejects buffers under 12 bytes', () => {
    expect(detectImageFormat(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe('search_images', () => {
  it('parses SearXNG response and returns hits', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          results: [
            { img_src: 'https://a/1.jpg', title: 'First', resolution: '800×600', source: 'a.com' },
            { img_src: 'https://b/2.png', title: 'Second', resolution: '1200×800', source: 'b.org' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const result = await searchImages.handler({ query: 'eiffel tower', max_results: 2 });

    expect(result.isError).toBeFalsy();
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('q=eiffel+tower');
    expect(fetchCalls[0].url).toContain('categories=images');
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ url: 'https://a/1.jpg', title: 'First', resolution: '800×600', source: 'a.com' });
  });

  it('caps max_results to 10', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      img_src: `https://x/${i}.jpg`,
      title: `T${i}`,
      resolution: '100×100',
      source: 'x',
    }));
    nextResponse = () => new Response(JSON.stringify({ results: many }), { status: 200 });

    const result = await searchImages.handler({ query: 'x', max_results: 999 });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toHaveLength(10);
  });

  it('skips results missing img_src', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          results: [
            { title: 'no-url' },
            { img_src: 'https://b/2.png', title: 'good' },
          ],
        }),
        { status: 200 },
      );

    const result = await searchImages.handler({ query: 'x' });
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].url).toBe('https://b/2.png');
  });

  it('returns error when SearXNG is unreachable', async () => {
    nextResponse = () => {
      throw new Error('ECONNREFUSED');
    };

    const result = await searchImages.handler({ query: 'x' });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('SearXNG unreachable');
  });

  it('returns error when no hits', async () => {
    nextResponse = () => new Response(JSON.stringify({ results: [] }), { status: 200 });

    const result = await searchImages.handler({ query: 'nothing-matches' });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('No image results');
  });

  it('returns error when query is empty', async () => {
    const result = await searchImages.handler({ query: '   ' });
    expect(result.isError).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('download_image', () => {
  it('saves a valid PNG and reports the path', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 0),
    ]);
    nextResponse = () => new Response(png, { status: 200, headers: { 'content-length': String(png.length) } });

    const result = await downloadImage.handler({ url: 'https://example.com/img.png' });
    expect(result.isError).toBeFalsy();
    const msg = (result.content[0] as { text: string }).text;
    expect(msg).toContain('.png');
    // Extract path and verify file exists in the temp cache.
    const match = msg.match(/Image saved to (\S+\.png)/);
    expect(match).toBeTruthy();
    if (match) {
      expect(match[1].startsWith(TEST_CACHE_DIR)).toBe(true);
      expect(fs.existsSync(match[1])).toBe(true);
    }
  });

  it('rejects HTML masquerading as image (magic-bytes mismatch)', async () => {
    const html = Buffer.from('<!DOCTYPE html><html><body>Not an image</body></html>', 'utf-8');
    nextResponse = () => new Response(html, { status: 200 });

    const result = await downloadImage.handler({ url: 'https://example.com/broken.jpg' });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('magic-bytes mismatch');
  });

  it('rejects oversized response via Content-Length pre-flight', async () => {
    nextResponse = () =>
      new Response('', { status: 200, headers: { 'content-length': String(10 * 1024 * 1024) } });

    const result = await downloadImage.handler({ url: 'https://example.com/big.jpg' });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('too large');
  });

  it('rejects when HTTP status is not ok', async () => {
    nextResponse = () => new Response('not found', { status: 404 });

    const result = await downloadImage.handler({ url: 'https://example.com/gone.jpg' });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('HTTP 404');
  });

  it('returns error when url is missing', async () => {
    const result = await downloadImage.handler({});
    expect(result.isError).toBe(true);
    expect(fetchCalls).toHaveLength(0);
  });
});
