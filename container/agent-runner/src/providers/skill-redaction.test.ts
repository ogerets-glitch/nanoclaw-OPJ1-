import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { redactSkillFulltexts, SKILL_REDACTION_MARKER_PREFIX, SESSION_START_COMPACT_DISCLAIMER } from './skill-redaction.js';

let tmpDir: string;
let transcriptPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-redact-test-'));
  transcriptPath = path.join(tmpDir, 'session.jsonl');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeJsonl(lines: object[]): void {
  fs.writeFileSync(transcriptPath, lines.map((l) => JSON.stringify(l)).join('\n'));
}

describe('redactSkillFulltexts', () => {
  test('redacts isMeta=true user-text-entries with body > 1000 chars and Base directory header', () => {
    const skillBody =
      'Base directory for this skill: /home/node/.claude/skills/last30days\n\n' +
      '# last30days\n\n'.padEnd(2000, 'X') +
      '\n\nARGUMENTS: some-topic';
    writeJsonl([
      {
        type: 'user',
        isMeta: true,
        timestamp: '2026-04-26T12:00:00Z',
        uuid: 'aaa',
        parentUuid: 'bbb',
        message: { role: 'user', content: [{ type: 'text', text: skillBody }] },
      },
      {
        type: 'user',
        isMeta: false,
        message: { role: 'user', content: [{ type: 'text', text: 'normal user message' }] },
      },
      {
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
      },
    ]);

    const result = redactSkillFulltexts(transcriptPath);
    expect(result.redacted).toBe(1);
    expect(result.scanned).toBe(3);
    expect(result.bytesSaved).toBeGreaterThan(0);

    const lines = fs.readFileSync(transcriptPath, 'utf-8').split('\n');
    const redactedEntry = JSON.parse(lines[0]);
    const text = redactedEntry.message.content[0].text;
    expect(text.startsWith(SKILL_REDACTION_MARKER_PREFIX)).toBe(true);
    expect(text).toContain('Skill name: last30days');
    expect(text).toContain('Original timestamp: 2026-04-26T12:00:00Z');
    expect(redactedEntry.uuid).toBe('aaa');
    expect(redactedEntry.parentUuid).toBe('bbb');
    expect(redactedEntry.timestamp).toBe('2026-04-26T12:00:00Z');

    const passthrough1 = JSON.parse(lines[1]);
    expect(passthrough1.message.content[0].text).toBe('normal user message');
    const passthrough2 = JSON.parse(lines[2]);
    expect(passthrough2.message.content[0].text).toBe('reply');
  });

  test('skips already-redacted entries (idempotent)', () => {
    const alreadyMarker = `${SKILL_REDACTION_MARKER_PREFIX} on 2026-05-08 ...]\n\nSkill name: foo\n` + 'X'.repeat(1000);
    writeJsonl([
      {
        type: 'user',
        isMeta: true,
        message: { role: 'user', content: [{ type: 'text', text: alreadyMarker }] },
      },
    ]);
    const result = redactSkillFulltexts(transcriptPath);
    expect(result.redacted).toBe(0);
  });

  test('skips short isMeta entries (< 1000 chars)', () => {
    writeJsonl([
      {
        type: 'user',
        isMeta: true,
        message: { role: 'user', content: [{ type: 'text', text: 'Continue from where you left off.' }] },
      },
    ]);
    const result = redactSkillFulltexts(transcriptPath);
    expect(result.redacted).toBe(0);
  });

  test('falls back to # Heading match when no Base directory header', () => {
    const skillBody = '# Update Config Skill\n\n' + 'X'.repeat(2000);
    writeJsonl([
      {
        type: 'user',
        isMeta: true,
        timestamp: '2026-04-24T19:00:00Z',
        message: { role: 'user', content: [{ type: 'text', text: skillBody }] },
      },
    ]);
    const result = redactSkillFulltexts(transcriptPath);
    expect(result.redacted).toBe(1);
    const entry = JSON.parse(fs.readFileSync(transcriptPath, 'utf-8').split('\n')[0]);
    expect(entry.message.content[0].text).toContain('Skill name: update-config');
  });

  test('preserves file owner and mode on atomic rename', () => {
    writeJsonl([
      {
        type: 'user',
        isMeta: true,
        message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: /x/y/foo\n' + 'Z'.repeat(2000) }] },
      },
    ]);
    fs.chmodSync(transcriptPath, 0o600);
    const before = fs.statSync(transcriptPath);
    redactSkillFulltexts(transcriptPath);
    const after = fs.statSync(transcriptPath);
    expect(after.uid).toBe(before.uid);
    expect(after.gid).toBe(before.gid);
    expect(after.mode & 0o777).toBe(0o600);
  });

  test('returns zero when transcript does not exist', () => {
    const result = redactSkillFulltexts('/tmp/does-not-exist-skill-redact.jsonl');
    expect(result).toEqual({ scanned: 0, redacted: 0, bytesSaved: 0 });
  });

  test('passthrough on unparseable lines', () => {
    fs.writeFileSync(transcriptPath, 'not-json-at-all\n{"type":"user","isMeta":false,"message":{"content":[{"type":"text","text":"ok"}]}}');
    const result = redactSkillFulltexts(transcriptPath);
    expect(result.redacted).toBe(0);
    const out = fs.readFileSync(transcriptPath, 'utf-8');
    expect(out).toContain('not-json-at-all');
  });
});

describe('SESSION_START_COMPACT_DISCLAIMER', () => {
  test('contains the historical-marker keyword', () => {
    expect(SESSION_START_COMPACT_DISCLAIMER).toContain('HISTORICAL');
    expect(SESSION_START_COMPACT_DISCLAIMER).toContain('skills were invoked');
  });
});
