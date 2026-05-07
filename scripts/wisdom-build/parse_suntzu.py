#!/usr/bin/env python3
"""Parse the Project Gutenberg Sun Tzu (Giles, 1910) plaintext into structured chunks.

Output: parsed/suntzu.json — list of {chapter, chapter_title, verse_range, text}
Each chunk groups 3-6 consecutive verses (Sun Tzu's own words, no editor commentary).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "raw" / "suntzu-giles-en.txt"
OUT = ROOT / "parsed" / "suntzu.json"

ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII"]
CHAPTER_RE = re.compile(r"^Chapter (" + "|".join(ROMAN) + r")\.\s+(.+)$")
VERSE_RE = re.compile(r"^(\d+(?:\s*[,&]\s*\d+)*)\.\s+(.+)$")

CHUNK_SIZE = 5  # verses per chunk
CHUNK_OVERLAP = 1


def strip_brackets(text: str) -> str:
    """Remove Giles' [...] editorial comments — handle nested brackets."""
    while True:
        new = re.sub(r"\[[^\[\]]*\]", "", text, flags=re.DOTALL)
        if new == text:
            return new.strip()
        text = new


def parse() -> list[dict]:
    raw = SRC.read_text(encoding="utf-8")
    lines = raw.splitlines()

    # Find chapter starts.
    chapters: list[dict] = []
    cur: dict | None = None
    in_body = False

    for line in lines:
        m = CHAPTER_RE.match(line.strip())
        if m:
            if cur is not None:
                chapters.append(cur)
            cur = {
                "chapter_roman": m.group(1),
                "chapter_num": ROMAN.index(m.group(1)) + 1,
                "title": m.group(2).strip().title(),
                "raw_lines": [],
            }
            in_body = True
            continue
        if cur is not None and in_body:
            cur["raw_lines"].append(line)

    if cur is not None:
        chapters.append(cur)

    # Trim trailing junk in last chapter at the Gutenberg end-marker
    # or at "[Footnote " or first occurrence of "Notes on Chapter".
    if chapters:
        last = chapters[-1]["raw_lines"]
        for i, line in enumerate(last):
            stripped = line.strip()
            if (
                "*** END OF" in stripped
                or "End of the Project Gutenberg" in stripped
                or stripped.startswith("[Footnote ")
                or re.match(r"^Notes on Chapter", stripped)
                or re.match(r"^FOOTNOTES", stripped)
            ):
                chapters[-1]["raw_lines"] = last[:i]
                break

    # Per chapter: re-flow the body, drop bracketed editor commentary,
    # extract numbered verses.
    out: list[dict] = []
    for ch in chapters:
        body = "\n".join(ch["raw_lines"])
        body = strip_brackets(body)
        # Re-flow paragraphs (verses can span multiple lines).
        body = re.sub(r"\n(?!\s*\n)", " ", body)
        body = re.sub(r"\s+", " ", body)

        # Split on verse markers like "1. " "2. " "5, 6. " — keep verse number.
        # Insert sentinel before each verse number.
        sentinel = ""
        body = re.sub(r"(?<=\.|\s)((?:\d+(?:\s*[,&]\s*\d+)*)\.)\s+", sentinel + r"\1 ", body)
        parts = [p.strip() for p in body.split(sentinel) if p.strip()]

        verses: list[dict] = []
        last_first_num = 0
        for p in parts:
            m = re.match(r"^(\d+(?:\s*[,&]\s*\d+)*)\.\s+(.*)$", p, re.DOTALL)
            if not m:
                continue
            num_label = m.group(1).strip()
            first_num = int(re.match(r"\d+", num_label).group(0))
            # Only accept verse numbers within plausible bounds and monotonic.
            if first_num > 80:
                break
            if first_num < last_first_num:
                # Footnote section ("Notes on Chapter X") restarts numbering — stop.
                break
            last_first_num = first_num
            text = re.sub(r"\s+", " ", m.group(2)).strip()
            if len(text) < 5:
                continue
            verses.append({"verse": num_label, "text": text})

        # Group verses into chunks of CHUNK_SIZE with overlap.
        chunks: list[dict] = []
        i = 0
        while i < len(verses):
            group = verses[i : i + CHUNK_SIZE]
            if not group:
                break
            verse_range = f"{group[0]['verse']}–{group[-1]['verse']}"
            text = " ".join(f"{v['verse']}. {v['text']}" for v in group)
            chunks.append(
                {
                    "source": "suntzu",
                    "source_label": "Sun Tzu — The Art of War (Giles 1910)",
                    "chapter_num": ch["chapter_num"],
                    "chapter_roman": ch["chapter_roman"],
                    "chapter_title": ch["title"],
                    "verse_range": verse_range,
                    "text": text,
                }
            )
            i += max(1, CHUNK_SIZE - CHUNK_OVERLAP)

        out.extend(chunks)

    return out


def main() -> None:
    chunks = parse()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(chunks, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(chunks)} chunks across {len({c['chapter_num'] for c in chunks})} chapters")
    print(f"Sample chunk:\n{json.dumps(chunks[0], indent=2, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
