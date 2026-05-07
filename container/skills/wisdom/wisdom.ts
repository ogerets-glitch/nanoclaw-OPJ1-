#!/usr/bin/env bun
// wisdom.ts - semantic search over wisdom corpora.
// Currently indexed: Sun Tzu - The Art of War (Lionel Giles 1910, Public Domain).

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const CHUNKS_DIR = join(SKILL_DIR, "chunks");
const CACHE_DIR = process.env.WISDOM_CACHE_DIR ?? "/home/node/.cache/wisdom";
const DB_PATH = join(CACHE_DIR, "wisdom.sqlite");
const EMBED_MODEL = "bge_multilingual_gemma2";
const INFOMANIAK_URL = "https://api.infomaniak.com/2/ai/108471/openai/v1/embeddings";

interface Chunk {
  source: string;
  source_label: string;
  chapter_num: number;
  chapter_roman: string;
  chapter_title: string;
  verse_range: string;
  text: string;
}

async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const resp = await fetch(INFOMANIAK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!resp.ok) {
    throw new Error(`Embedding failed: HTTP ${resp.status} - ${await resp.text()}`);
  }
  const data = (await resp.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => new Float32Array(d.embedding));
}

function openDb(): Database {
  mkdirSync(CACHE_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_label TEXT NOT NULL,
      chapter_num INTEGER NOT NULL,
      chapter_roman TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      verse_range TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
  `);
  return db;
}

function loadCorpora(): Chunk[] {
  const all: Chunk[] = [];
  for (const file of ["suntzu.json"]) {
    const path = join(CHUNKS_DIR, file);
    if (!existsSync(path)) continue;
    const arr = JSON.parse(readFileSync(path, "utf8")) as Chunk[];
    all.push(...arr);
  }
  return all;
}

async function build(force = false): Promise<void> {
  const db = openDb();
  const count = (db.query("SELECT COUNT(*) AS c FROM chunks").get() as { c: number }).c;
  if (count > 0 && !force) {
    console.error(`Cache already has ${count} chunks. Use 'build --force' to rebuild.`);
    return;
  }
  if (force) db.exec("DELETE FROM chunks");

  const chunks = loadCorpora();
  if (chunks.length === 0) {
    throw new Error(`No chunk files found in ${CHUNKS_DIR}`);
  }
  console.error(`Building embeddings for ${chunks.length} chunks via ${EMBED_MODEL}...`);

  const insert = db.prepare(`
    INSERT INTO chunks (source, source_label, chapter_num, chapter_roman, chapter_title, verse_range, text, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const txInsert = db.transaction((rows: Array<{ c: Chunk; e: Float32Array }>) => {
    for (const { c, e } of rows) {
      insert.run(
        c.source,
        c.source_label,
        c.chapter_num,
        c.chapter_roman,
        c.chapter_title,
        c.verse_range,
        c.text,
        Buffer.from(e.buffer, e.byteOffset, e.byteLength),
      );
    }
  });

  const BATCH = 16;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const embeddings = await embedBatch(batch.map((c) => c.text));
    txInsert(batch.map((c, j) => ({ c, e: embeddings[j] })));
    console.error(`  ${Math.min(i + BATCH, chunks.length)} / ${chunks.length}`);
  }
  console.error(`Done. ${chunks.length} chunks indexed at ${DB_PATH}`);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function blobToFloat32(blob: Uint8Array): Float32Array {
  const buf = new ArrayBuffer(blob.byteLength);
  new Uint8Array(buf).set(blob);
  return new Float32Array(buf);
}

async function search(query: string, k = 5): Promise<void> {
  let db = openDb();
  const count = (db.query("SELECT COUNT(*) AS c FROM chunks").get() as { c: number }).c;
  if (count === 0) {
    console.error("Cache empty - running initial build (one-time, ~30 s)");
    db.close();
    await build(false);
    db = openDb();
  }

  const [queryEmb] = await embedBatch([query]);
  const rows = db.query("SELECT * FROM chunks").all() as Array<{
    id: number;
    source_label: string;
    chapter_num: number;
    chapter_title: string;
    verse_range: string;
    text: string;
    embedding: Uint8Array;
  }>;

  const scored = rows.map((r) => ({
    ...r,
    score: cosine(queryEmb, blobToFloat32(r.embedding)),
  }));
  scored.sort((a, b) => b.score - a.score);

  for (const r of scored.slice(0, k)) {
    console.log(`\n- ${r.source_label}, Kapitel ${r.chapter_num} (${r.chapter_title}), Verse ${r.verse_range}`);
    console.log(`  Score: ${r.score.toFixed(3)}`);
    const preview = r.text.length > 400 ? r.text.slice(0, 400) + "..." : r.text;
    console.log(`  ${preview}`);
  }
}

function info(): void {
  const db = openDb();
  const stats = db.query("SELECT source, COUNT(*) AS n FROM chunks GROUP BY source").all() as Array<{
    source: string;
    n: number;
  }>;
  if (stats.length === 0) {
    console.log("Cache empty. Run 'build' or invoke 'search' (auto-builds).");
  } else {
    for (const s of stats) {
      console.log(`  ${s.source}: ${s.n} chunks`);
    }
    console.log(`  cache: ${DB_PATH}`);
  }
}

const [, , mode, ...args] = process.argv;

(async () => {
  switch (mode) {
    case "search": {
      const last = Number(args[args.length - 1]);
      const queryArgs = Number.isFinite(last) ? args.slice(0, -1) : args;
      const query = queryArgs.join(" ").trim();
      if (!query) {
        console.error('Usage: wisdom.ts search "<query>" [k]');
        process.exit(1);
      }
      await search(query, Number.isFinite(last) ? last : 5);
      break;
    }
    case "build":
      await build(args.includes("--force"));
      break;
    case "info":
      info();
      break;
    default:
      console.error("Usage: wisdom.ts <search|build|info> [args]");
      process.exit(1);
  }
})().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
