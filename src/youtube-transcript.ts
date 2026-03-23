import { logger } from './logger.js';

/**
 * Max characters per transcript before truncation (~7500 tokens).
 * When multiple videos are detected, the budget is split evenly.
 */
const MAX_TRANSCRIPT_CHARS = 30_000;

/** Matches all common YouTube URL formats and extracts the video ID. */
const YOUTUBE_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([\w-]{11})(?:[?&#]|\b)/gi;

const MICROSERVICE_URL = 'http://localhost:8387/transcript';

export interface YouTubeTranscriptResult {
  videoId: string;
  url: string;
  transcript: string | null;
  error: string | null;
}

/**
 * Extract all YouTube video IDs from a text.
 * Returns unique IDs in order of appearance.
 */
export function extractYouTubeUrls(text: string): { videoId: string; url: string }[] {
  const seen = new Set<string>();
  const results: { videoId: string; url: string }[] = [];

  for (const match of text.matchAll(YOUTUBE_URL_RE)) {
    const videoId = match[1];
    if (!seen.has(videoId)) {
      seen.add(videoId);
      results.push({ videoId, url: match[0] });
    }
  }

  return results;
}

/**
 * Fetch transcript for a single YouTube video via local microservice.
 */
async function fetchSingleTranscript(
  videoId: string,
  maxChars: number,
): Promise<{ transcript: string | null; error: string | null }> {
  try {
    const res = await fetch(`${MICROSERVICE_URL}?v=${encodeURIComponent(videoId)}`, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn({ videoId, status: res.status, body }, 'YouTube transcript microservice error');
      return { transcript: null, error: mapHttpError(res.status, body) };
    }

    const data = (await res.json()) as { text?: string; transcript?: string; error?: string };

    if (data.error) {
      logger.warn({ videoId, error: data.error }, 'YouTube transcript unavailable');
      return { transcript: null, error: data.error };
    }

    const text = data.text ?? data.transcript;
    if (!text) {
      return { transcript: null, error: 'Transkript ist leer.' };
    }

    let fullText = text;
    if (fullText.length > maxChars) {
      fullText = fullText.slice(0, maxChars) + '\n\n[… Transkript gekürzt]';
    }

    return { transcript: fullText, error: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      logger.warn({ videoId }, 'YouTube transcript microservice timeout');
      return { transcript: null, error: 'Transkript-Microservice hat nicht rechtzeitig geantwortet.' };
    }
    logger.error({ videoId, error: err }, 'YouTube transcript fetch failed');
    return {
      transcript: null,
      error: 'Transkript-Microservice nicht erreichbar (http://localhost:8387).',
    };
  }
}

function mapHttpError(status: number, body: string): string {
  if (status === 404) return 'Kein Transkript für dieses Video verfügbar.';
  if (status === 429) return 'Zu viele Anfragen — bitte später erneut versuchen.';
  if (status >= 500) return 'Transkript-Microservice interner Fehler.';
  return body || 'Transkript konnte nicht abgerufen werden.';
}

/**
 * Detect YouTube URLs in messages and fetch transcripts.
 * Returns an XML block to append to the prompt, or empty string if no URLs found.
 */
export async function enrichWithYouTubeTranscripts(
  messages: { content: string }[],
): Promise<string> {
  const allText = messages.map((m) => m.content).join('\n');
  const urls = extractYouTubeUrls(allText);

  if (urls.length === 0) return '';

  const perVideoLimit = Math.floor(MAX_TRANSCRIPT_CHARS / urls.length);

  const results = await Promise.all(
    urls.map(async ({ videoId, url }) => {
      const { transcript, error } = await fetchSingleTranscript(videoId, perVideoLimit);
      return { videoId, url, transcript, error } as YouTubeTranscriptResult;
    }),
  );

  const blocks = results.map((r) => {
    if (r.transcript) {
      return `<youtube-transcript video-id="${r.videoId}" url="${r.url}">\n${r.transcript}\n</youtube-transcript>`;
    }
    return `<youtube-transcript video-id="${r.videoId}" url="${r.url}" error="${r.error}" />`;
  });

  return `\n<youtube-transcripts>\n${blocks.join('\n')}\n</youtube-transcripts>`;
}
