#!/usr/bin/env python3
"""Parse the I Ging (Wilhelm 1923, Public Domain since 2001) plaintext into
structured chunks.

Source: pdftotext -layout iging-de.pdf (METIS Zürich edition, 2023 typesetting,
text body is Wilhelm's 1923 translation).

Output: parsed/iging.json — list of {chapter, chapter_title, section, text}.
Per hexagram, three sections become separate chunks:
  - "deutung" (intro + Urteil + commentary, joined)
  - "bild" (Das Bild + commentary)
  - "linien" (Die einzelnen Linien — kept as one chunk; lines are short)
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "raw" / "iging-de.txt"
OUT = ROOT / "parsed" / "iging.json"

# Header line pattern: "1. Kiën - Das Schöpferische" or "4. Mong / Die Jugendtorheit"
# Allow Unicode letters + slashes/dashes between number and title.
HEX_HEADER = re.compile(
    r"^\s*(\d{1,2})\.\s+([\w\s]+?)\s*[-/]\s*(.+?)\s*$",
    re.UNICODE,
)

# Section markers that introduce sub-blocks within a hexagram.
SECTION_PATTERNS = {
    "urteil": re.compile(r"^Das Urteil\s*$"),
    "bild": re.compile(r"^Das Bild\s*$"),
    "linien": re.compile(r"^Die einzelnen Linien\s*$"),
}

# Skip everything before "Erste Abteilung" (introduction etc.) and after the
# last hexagram body.
START_RE = re.compile(r"^\s*Erste Abteilung\s*$")
APPENDIX_RE = re.compile(
    r"^\s*(Anmerkungen|Anhang|Buch der Wandlungen|Die Reihenfolge|Das Geschichtliche)"
)

PAGE_NUM_RE = re.compile(r"^\s*\d+\s*$")


def clean_lines(raw: str) -> list[str]:
    out: list[str] = []
    for line in raw.splitlines():
        if PAGE_NUM_RE.match(line):
            continue
        out.append(line.rstrip())
    return out


def parse() -> list[dict]:
    raw = SRC.read_text(encoding="utf-8")
    lines = clean_lines(raw)

    # Find body start.
    start = 0
    for i, line in enumerate(lines):
        if START_RE.match(line):
            start = i + 1
            break

    # Walk and collect hexagrams.
    hexagrams: list[dict] = []
    cur: dict | None = None
    cur_section: str | None = None
    section_lines: list[str] = []

    def flush_section(target_hex: dict, section: str | None, buf: list[str]) -> None:
        if section is None:
            return
        text = "\n".join(buf).strip()
        text = re.sub(r"\n{3,}", "\n\n", text)
        if text:
            target_hex.setdefault("sections", {})[section] = text

    for i in range(start, len(lines)):
        line = lines[i]

        if APPENDIX_RE.match(line) and cur is not None:
            flush_section(cur, cur_section, section_lines)
            hexagrams.append(cur)
            cur = None
            break

        m = HEX_HEADER.match(line)
        if m and 1 <= int(m.group(1)) <= 64 and len(m.group(3)) >= 3:
            # New hexagram. Flush previous.
            if cur is not None:
                flush_section(cur, cur_section, section_lines)
                hexagrams.append(cur)
            num = int(m.group(1))
            cur = {
                "number": num,
                "name_zh": m.group(2).strip(),
                "name_de": m.group(3).strip(),
                "intro_lines": [],
                "sections": {},
            }
            cur_section = "intro"
            section_lines = []
            continue

        if cur is None:
            continue

        section_match = None
        for key, pat in SECTION_PATTERNS.items():
            if pat.match(line):
                section_match = key
                break

        if section_match:
            flush_section(cur, cur_section, section_lines)
            cur_section = section_match
            section_lines = []
            continue

        if cur_section == "intro":
            cur["intro_lines"].append(line)
        else:
            section_lines.append(line)

    if cur is not None:
        flush_section(cur, cur_section, section_lines)
        hexagrams.append(cur)

    # Build chunks: per hexagram, three chunks (deutung/bild/linien).
    out: list[dict] = []
    for h in hexagrams:
        intro = "\n".join(h["intro_lines"]).strip()
        intro = re.sub(r"\n{3,}", "\n\n", intro)
        urteil = h["sections"].get("urteil", "")
        bild = h["sections"].get("bild", "")
        linien = h["sections"].get("linien", "")

        # Skip hexagrams that didn't parse correctly (no Urteil = something is off).
        if not urteil:
            continue

        deutung_text = (intro + "\n\n" + urteil).strip()
        if deutung_text:
            out.append(
                {
                    "source": "iging",
                    "source_label": "I Ging — Buch der Wandlungen (Richard Wilhelm 1923)",
                    "chapter_num": h["number"],
                    "chapter_roman": str(h["number"]),
                    "chapter_title": f"{h['name_zh']} — {h['name_de']}",
                    "verse_range": "Zeichen + Urteil",
                    "text": deutung_text,
                }
            )
        if bild:
            out.append(
                {
                    "source": "iging",
                    "source_label": "I Ging — Buch der Wandlungen (Richard Wilhelm 1923)",
                    "chapter_num": h["number"],
                    "chapter_roman": str(h["number"]),
                    "chapter_title": f"{h['name_zh']} — {h['name_de']}",
                    "verse_range": "Bild",
                    "text": bild,
                }
            )
        if linien:
            # If "linien" is too long, split per line marker (Anfangs-..., Sechs ..., Neun ...).
            line_chunks = split_linien(linien)
            for idx, lc in enumerate(line_chunks):
                out.append(
                    {
                        "source": "iging",
                        "source_label": "I Ging — Buch der Wandlungen (Richard Wilhelm 1923)",
                        "chapter_num": h["number"],
                        "chapter_roman": str(h["number"]),
                        "chapter_title": f"{h['name_zh']} — {h['name_de']}",
                        "verse_range": f"Linien {idx + 1}/{len(line_chunks)}",
                        "text": lc,
                    }
                )

    return out


LINE_MARKER = re.compile(r"^(?:Anfangs|Sechs|Neun|Oben).*?:", re.MULTILINE)


def split_linien(linien: str) -> list[str]:
    """Split the 'Die einzelnen Linien' block into 1-3 chunks if too long."""
    if len(linien) <= 1500:
        return [linien]
    # Find line-marker positions and split into halves/thirds.
    matches = list(LINE_MARKER.finditer(linien))
    if len(matches) < 4:
        return [linien]
    n_chunks = 2 if len(linien) <= 3000 else 3
    chunk_size = max(1, len(matches) // n_chunks)
    chunks: list[str] = []
    for i in range(0, len(matches), chunk_size):
        start_idx = matches[i].start()
        end_idx = matches[i + chunk_size].start() if i + chunk_size < len(matches) else len(linien)
        chunks.append(linien[start_idx:end_idx].strip())
    return [c for c in chunks if c]


def main() -> None:
    chunks = parse()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(chunks, indent=2, ensure_ascii=False), encoding="utf-8")
    n_hex = len({c["chapter_num"] for c in chunks})
    print(f"Wrote {len(chunks)} chunks across {n_hex} hexagrams")
    if n_hex < 64:
        missing = sorted(set(range(1, 65)) - {c["chapter_num"] for c in chunks})
        print(f"Missing hexagrams: {missing}")
    print(f"Avg chunk len: {sum(len(c['text']) for c in chunks) // len(chunks)} chars")


if __name__ == "__main__":
    main()
