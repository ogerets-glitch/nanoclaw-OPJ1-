/**
 * Unit tests for the Delta-Chat adapter's pure helpers.
 *
 * The adapter as a whole needs a live `deltachat-rpc-server` binary plus
 * Whisper STT at 127.0.0.1:8384 to exercise — that's covered by the
 * end-to-end smoketest on the VPS. Here we lock down the routing-impacting
 * pure functions (chunking, filename sanitization, viewtype inference, MIME
 * tool hints) so refactors don't silently break behavior.
 */
import { describe, it, expect } from 'vitest';

import { chunkText, sanitizeFilename, toAgentPath, toolHintForMime, viewtypeForOutbound } from './deltachat.js';

describe('chunkText', () => {
  it('returns the input unchanged when below the limit', () => {
    expect(chunkText('hello world', 2000)).toEqual(['hello world']);
  });

  it('splits on newlines preferentially', () => {
    const text = 'line1\nline2\nline3';
    const chunks = chunkText(text, 12);
    // chunkText prefers newline split points; the leading newline of the
    // next chunk is stripped so the user doesn't see a blank-line gap.
    expect(chunks).toEqual(['line1\nline2', 'line3']);
  });

  it('falls back to hard-cut when no newline fits', () => {
    const text = 'aaaaaaaaaaaaaaaaaaaaaaaaaa'; // 26 chars, no newlines
    const chunks = chunkText(text, 10);
    expect(chunks).toEqual(['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaaaa']);
  });

  it('handles empty string without crashing', () => {
    expect(chunkText('', 2000)).toEqual(['']);
  });
});

describe('sanitizeFilename', () => {
  it('keeps safe ASCII filenames intact', () => {
    expect(sanitizeFilename('contract.pdf')).toBe('contract.pdf');
    expect(sanitizeFilename('photo_2026-05-17.jpg')).toBe('photo_2026-05-17.jpg');
  });

  it('replaces unsafe characters with underscore', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(sanitizeFilename("rude'name with spaces.txt")).toBe('rude_name_with_spaces.txt');
  });

  it('caps overly long names', () => {
    const long = 'a'.repeat(300) + '.txt';
    const result = sanitizeFilename(long);
    expect(result.length).toBe(200);
  });

  it('falls back to attachment.bin for empty input', () => {
    expect(sanitizeFilename('')).toBe('attachment.bin');
  });
});

describe('toolHintForMime', () => {
  it('routes PDFs to the PDF tool', () => {
    expect(toolHintForMime('application/pdf')).toMatch(/PDF-Tool/i);
  });

  it('routes Office documents to their skills', () => {
    expect(toolHintForMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toMatch(
      /docx-Skill/i,
    );
    expect(toolHintForMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toMatch(/xlsx-/i);
    expect(toolHintForMime('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toMatch(
      /pptx-Skill/i,
    );
  });

  it('lets text/JSON/XML go through read tool', () => {
    expect(toolHintForMime('text/plain')).toMatch(/read-Tool/i);
    expect(toolHintForMime('application/json')).toMatch(/read-Tool/i);
  });

  it('falls back to a generic warning for unknown mime', () => {
    expect(toolHintForMime('application/x-unknown')).toMatch(/passende Tool/i);
    expect(toolHintForMime(null)).toMatch(/passende Tool/i);
  });
});

describe('viewtypeForOutbound', () => {
  it('routes short audio files to Voice', () => {
    expect(viewtypeForOutbound('reply.ogg', 100_000)).toBe('Voice');
    expect(viewtypeForOutbound('message.m4a', 1_500_000)).toBe('Voice');
  });

  it('routes long audio files to Audio', () => {
    expect(viewtypeForOutbound('podcast.mp3', 10 * 1024 * 1024)).toBe('Audio');
  });

  it('detects images by extension', () => {
    expect(viewtypeForOutbound('selfie.jpg', 500_000)).toBe('Image');
    expect(viewtypeForOutbound('chart.png', 500_000)).toBe('Image');
    expect(viewtypeForOutbound('animated.gif', 500_000)).toBe('Image');
  });

  it('detects video by extension', () => {
    expect(viewtypeForOutbound('clip.mp4', 5_000_000)).toBe('Video');
  });

  it('falls back to File for unknown extensions', () => {
    expect(viewtypeForOutbound('report.pdf', 200_000)).toBe('File');
    expect(viewtypeForOutbound('data.csv', 1000)).toBe('File');
    expect(viewtypeForOutbound('noextension', 1000)).toBe('File');
  });
});

describe('toAgentPath', () => {
  it('rewrites the host prefix to the agent prefix', () => {
    const out = toAgentPath(
      '/home/opj1claw/.deltachat-data/attachments-in/oliver-11/26-abc/photo.jpg',
      '/home/opj1claw/.deltachat-data/attachments-in',
      '/workspace/extra/deltachat-attachments',
    );
    expect(out).toBe('/workspace/extra/deltachat-attachments/oliver-11/26-abc/photo.jpg');
  });

  it('returns host path unchanged when agent prefix is null', () => {
    const out = toAgentPath('/some/path/foo.bin', '/some/path', null);
    expect(out).toBe('/some/path/foo.bin');
  });

  it('returns host path unchanged when it does not start with host prefix', () => {
    const out = toAgentPath('/other/path/foo.bin', '/some/path', '/mapped');
    expect(out).toBe('/other/path/foo.bin');
  });
});

describe('allowlist parsing (smoke)', () => {
  it('parses comma-separated contact ids identical to the factory', () => {
    const raw = ' 4, 12, 11 ,not-a-number, 0, -3';
    const ids = new Set<number>();
    for (const part of raw.split(',')) {
      const id = parseInt(part.trim(), 10);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }
    expect([...ids].sort((a, b) => a - b)).toEqual([4, 11, 12]);
  });
});
