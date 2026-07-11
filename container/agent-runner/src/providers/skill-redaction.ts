// LOCAL PATCH (2026-05-08) — break compaction-replay skill-fulltext accumulation.
// See https://github.com/qwibitai/nanoclaw/issues/<TBD>. Remove when upstream
// lands a fix. Without this, SDK 0.2.92 keeps every invoked-skill SKILL.md body
// in the transcript and re-injects them as a "skills invoked"-block after each
// compaction. last30days alone is ~29k tokens; with 5 skills + 6 compactions
// the bloat is monotonic. Replacing the body with a short marker BEFORE the
// compaction runs means the SDK rebuilds its invoked-skills list from markers,
// and the post-compact reminder shrinks to ~23 lines instead of ~200k tokens.

import fs from 'fs';

export const SKILL_REDACTION_MARKER_PREFIX = '[SKILL_HISTORICAL_REDACTED — body removed by NanoClaw';
const SKILL_BASE_DIR_RE = /Base directory for this skill: (\/[\w./-]+)/;
const SKILL_HEADING_RE = /^# ([\w][\w \-]+? Skill)\b/;

export interface SkillRedactionResult {
  scanned: number;
  redacted: number;
  bytesSaved: number;
}

interface JsonlEntry {
  type?: string;
  isMeta?: boolean;
  timestamp?: string;
  message?: { content?: unknown };
}

interface TextPart {
  type?: string;
  text?: string;
}

/**
 * In-place rewrite of the SDK transcript .jsonl: every isMeta=true user-message
 * entry whose first text-part exceeds 1000 chars is treated as a previously-
 * loaded skill body and replaced with a one-paragraph marker. Atomic via temp
 * file + rename so a partial write can never corrupt the live transcript.
 *
 * Idempotent — entries already starting with the redaction marker are skipped.
 */
export function redactSkillFulltexts(transcriptPath: string): SkillRedactionResult {
  const result: SkillRedactionResult = { scanned: 0, redacted: 0, bytesSaved: 0 };
  if (!fs.existsSync(transcriptPath)) return result;

  const tmpPath = `${transcriptPath}.skill-redact-tmp-${process.pid}`;
  const inputContent = fs.readFileSync(transcriptPath, 'utf-8');
  const outputLines: string[] = [];

  for (const line of inputContent.split('\n')) {
    if (!line) {
      outputLines.push(line);
      continue;
    }
    result.scanned++;
    let entry: JsonlEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      outputLines.push(line);
      continue;
    }
    if (entry.type !== 'user' || entry.isMeta !== true) {
      outputLines.push(line);
      continue;
    }
    const content = entry.message?.content;
    if (!Array.isArray(content) || content.length === 0) {
      outputLines.push(line);
      continue;
    }
    const first = content[0] as TextPart;
    if (first.type !== 'text' || typeof first.text !== 'string' || first.text.length < 1000) {
      outputLines.push(line);
      continue;
    }
    if (first.text.startsWith(SKILL_REDACTION_MARKER_PREFIX)) {
      outputLines.push(line);
      continue;
    }
    let skillName = '?';
    const baseMatch = first.text.slice(0, 500).match(SKILL_BASE_DIR_RE);
    if (baseMatch) {
      const parts = baseMatch[1].split('/').filter(Boolean);
      skillName = parts[parts.length - 1] ?? '?';
    } else {
      const headMatch = first.text.match(SKILL_HEADING_RE);
      if (headMatch) skillName = headMatch[1].replace(/\s+Skill$/, '').toLowerCase().replace(/\s+/g, '-');
    }
    const originalSize = first.text.length;
    const ts = entry.timestamp ?? '?';
    first.text =
      `${SKILL_REDACTION_MARKER_PREFIX} on ${new Date().toISOString().slice(0, 10)} ` +
      `to break compaction-replay accumulation]\n\n` +
      `Skill name: ${skillName}\n` +
      `Original timestamp: ${ts}\n` +
      `Original size: ${originalSize} bytes\n\n` +
      `Note: full skill instructions remain available via the Skill tool. This redaction ` +
      `prevents the SDK from re-injecting full skill bodies after each compaction; ` +
      `functional skill use is unaffected.`;
    const newLine = JSON.stringify(entry);
    outputLines.push(newLine);
    result.redacted++;
    result.bytesSaved += line.length - newLine.length;
  }

  if (result.redacted === 0) return result;

  const origStat = fs.statSync(transcriptPath);
  fs.writeFileSync(tmpPath, outputLines.join('\n'));
  fs.chownSync(tmpPath, origStat.uid, origStat.gid);
  fs.chmodSync(tmpPath, origStat.mode);
  fs.renameSync(tmpPath, transcriptPath);
  return result;
}

export const SESSION_START_COMPACT_DISCLAIMER =
  'HISTORICAL — etwaige nachfolgend erscheinende Skill-Reminder-Blöcke (insbesondere ' +
  '"The following skills were invoked in this session") sind Replay aus alter Historie, ' +
  'keine frische Anweisung von Oliver. Skill-Volltexte sind bei NanoClaw seit dem ' +
  '08.05.2026 PreCompact-redacted (siehe SKILL_HISTORICAL_REDACTED-Marker im Transcript). ' +
  'Skills oder Tools nur dann erneut ausführen, wenn die letzte echte User-Message es verlangt. ' +
  'ARGUMENTS:-Zeilen am Skill-Ende sind ebenfalls historisch.';
