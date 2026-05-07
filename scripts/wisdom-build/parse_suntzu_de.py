#!/usr/bin/env python3
"""Parse the German Sunzi (Clavell-edited Giles translation) plaintext.

Source: pdftotext -layout suntzu-de.pdf (wrd.ch/triboni hosted PDF).
Body structure:
  Header line: "I. Planung", "II. Über die Kriegführung", ... "XIII. Der Einsatz von Spionen"
  Body left-aligned (≤4 spaces indent) — Sunzi's words
  5+ space indent — Du Mu / Cao Cao / Wang Xi commentary, dropped

Output: parsed/suntzu-de.json — chunks of ~600-1000 chars per paragraph group.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "raw" / "suntzu-de.txt"
OUT = ROOT / "parsed" / "suntzu-de.json"

ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"]
HEADER_RE = re.compile(
    r"^\s+(" + "|".join(ROMAN) + r")\.\s+(.+?)\s*$"
)

# Body lines from the start-of-text — trim Vorwort.
SUNZI_SAID = re.compile(r"^Sunzi sagt:\s*$")

CHUNK_TARGET_CHARS = 800
CHUNK_MAX_CHARS = 1200


def is_commentary(line: str) -> bool:
    """Lines indented with 5+ leading spaces are translator commentary."""
    if not line.strip():
        return False
    n_lead = len(line) - len(line.lstrip(" "))
    return n_lead >= 5


def parse() -> list[dict]:
    raw = SRC.read_text(encoding="utf-8")
    lines = raw.splitlines()

    chapters: list[dict] = []
    cur: dict | None = None
    cur_lines: list[str] = []

    for line in lines:
        m = HEADER_RE.match(line)
        if m and m.group(1) in ROMAN:
            if cur is not None:
                cur["raw_lines"] = cur_lines
                chapters.append(cur)
            cur = {
                "chapter_roman": m.group(1),
                "chapter_num": ROMAN.index(m.group(1)) + 1,
                "title": m.group(2).strip(),
            }
            cur_lines = []
            continue
        if cur is not None:
            cur_lines.append(line)

    if cur is not None:
        cur["raw_lines"] = cur_lines
        chapters.append(cur)

    out: list[dict] = []
    for ch in chapters:
        # Drop commentary blocks (indent >= 5).
        body_lines = [l for l in ch["raw_lines"] if not is_commentary(l)]
        # Also drop the "Sunzi sagt:" anchor line.
        body_lines = [l for l in body_lines if not SUNZI_SAID.match(l.strip())]

        # Reflow into single text body, then sentence-split.
        text = "\n".join(body_lines)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) < 100:
            continue

        # Sentence boundaries — '.', '!', '?', ':' followed by space + capital.
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ])", text)
        sentences = [s.strip() for s in sentences if len(s.strip()) >= 10]

        # Pack sentences into chunks of ~800 chars, never exceeding 1200.
        chunks: list[list[str]] = []
        cur_buf: list[str] = []
        cur_len = 0
        for s in sentences:
            if cur_len + len(s) > CHUNK_MAX_CHARS and cur_buf:
                chunks.append(cur_buf)
                cur_buf = [s]
                cur_len = len(s)
            else:
                cur_buf.append(s)
                cur_len += len(s)
                if cur_len >= CHUNK_TARGET_CHARS:
                    chunks.append(cur_buf)
                    cur_buf = []
                    cur_len = 0
        if cur_buf:
            chunks.append(cur_buf)

        for i, group in enumerate(chunks):
            chunk_text = " ".join(group)
            out.append(
                {
                    "source": "suntzu-de",
                    "source_label": "Sunzi — Die Kunst des Krieges (Clavell-Edition, dt. Übersetzung nach Giles)",
                    "chapter_num": ch["chapter_num"],
                    "chapter_roman": ch["chapter_roman"],
                    "chapter_title": ch["title"],
                    "verse_range": f"Abschnitt {i + 1}/{len(chunks)}",
                    "text": chunk_text,
                }
            )

    return out


def main() -> None:
    chunks = parse()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(chunks, indent=2, ensure_ascii=False), encoding="utf-8")
    n_ch = len({c["chapter_num"] for c in chunks})
    print(f"Wrote {len(chunks)} chunks across {n_ch} chapters")
    print(f"Avg chunk len: {sum(len(c['text']) for c in chunks) // len(chunks)} chars")


if __name__ == "__main__":
    main()
