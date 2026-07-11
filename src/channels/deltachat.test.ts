import { describe, expect, it } from 'vitest';

import { chunkText } from './deltachat.js';

// Production budgets (mirror the constants in deltachat.ts). Delta-Chat's core
// truncates a bubble past 38 display-lines or ~3800 chars, where a physical
// line counts as ceil(len / 100) display-lines.
const LIMIT = 3000;
const MAX_LINES = 34;
const LINE_LEN = 100;

/** Display-line count Delta-Chat attributes to a chunk. */
function displayLineCount(text: string): number {
  return text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / LINE_LEN)), 0);
}

/** The invariant every chunk must satisfy to render inline (untruncated). */
function assertWithinBudget(chunks: string[]): void {
  for (const chunk of chunks) {
    expect(chunk.length).toBeLessThanOrEqual(LIMIT);
    expect(displayLineCount(chunk)).toBeLessThanOrEqual(MAX_LINES);
  }
}

describe('chunkText', () => {
  it('returns the text unchanged when it fits both budgets', () => {
    const text = 'Kurze Antwort über drei\nZeilen\nhinweg.';
    expect(chunkText(text, LIMIT, MAX_LINES)).toEqual([text]);
  });

  it('splits on the line budget even when far under the char budget', () => {
    // 50 short lines = 50 display-lines but only ~250 chars — the old
    // char-only chunking would have sent this as one truncated bubble.
    const text = Array.from({ length: 50 }, (_, i) => `Punkt ${i + 1}`).join('\n');
    expect(text.length).toBeLessThan(LIMIT);

    const chunks = chunkText(text, LIMIT, MAX_LINES);
    expect(chunks.length).toBeGreaterThan(1);
    assertWithinBudget(chunks);
    // No content lost or reordered: rejoining reproduces the original.
    expect(chunks.join('\n')).toBe(text);
  });

  it('breaks an over-long single line at word boundaries (no mid-word cut)', () => {
    const word = 'Wort';
    const line = Array.from({ length: 1500 }, () => word).join(' '); // > LIMIT chars, one physical line
    const chunks = chunkText(line, LIMIT, MAX_LINES);

    expect(chunks.length).toBeGreaterThan(1);
    assertWithinBudget(chunks);
    for (const chunk of chunks) {
      // Every chunk is whole words only.
      for (const tok of chunk.split(/\s+/)) {
        expect(tok).toBe(word);
      }
    }
  });

  it('hard-cuts an unbroken token with no word boundary', () => {
    const token = 'x'.repeat(7000); // single line, no spaces, no newlines
    const chunks = chunkText(token, LIMIT, MAX_LINES);

    expect(chunks.length).toBeGreaterThan(1);
    assertWithinBudget(chunks);
    expect(chunks.join('')).toBe(token); // lossless for spaceless input
  });

  it('keeps every chunk within budget for mixed real-world replies', () => {
    const samples = [
      // Long bullet list (the reported failure mode).
      Array.from({ length: 60 }, (_, i) => `- Aufgabe ${i + 1}: etwas erledigen`).join('\n'),
      // Several long paragraphs separated by blank lines.
      Array.from({ length: 8 }, () => 'Satz. '.repeat(120).trim()).join('\n\n'),
      // Mix of headings, short lines and one very long line.
      `# Überschrift\n${'a'.repeat(4200)}\n` + Array.from({ length: 40 }, () => 'kurz').join('\n'),
    ];
    for (const text of samples) {
      assertWithinBudget(chunkText(text, LIMIT, MAX_LINES));
    }
  });
});
