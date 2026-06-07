---
name: pdf-reader
description: Read, extract, and edit PDF files — documents, reports, contracts, spreadsheets. Extract text, merge multiple PDFs, split out page ranges, rotate pages, compress file size. Use whenever you need to read or manipulate PDF content, not just when explicitly asked. Handles local files, URLs, and Telegram attachments.
allowed-tools: Bash(pdf-reader:*)
---

# PDF Reader & Editor

## Quick start

```bash
pdf-reader extract report.pdf              # Extract all text
pdf-reader extract report.pdf --layout     # Preserve tables/columns
pdf-reader fetch https://example.com/doc.pdf  # Download and extract
pdf-reader info report.pdf                 # Show metadata + size
pdf-reader list                            # List all PDFs in directory tree
pdf-reader merge out.pdf a.pdf b.pdf       # Merge PDFs into one
pdf-reader split report.pdf --pages 3-7    # Extract pages 3-7 as new PDF
pdf-reader rotate scan.pdf +90             # Rotate all pages 90° clockwise
pdf-reader compress big.pdf                # Shrink file size (/ebook quality)
```

## Commands

### extract — Extract text from PDF

```bash
pdf-reader extract <file>                        # Full text to stdout
pdf-reader extract <file> --layout               # Preserve layout (tables, columns)
pdf-reader extract <file> --pages 1-5            # Pages 1 through 5
pdf-reader extract <file> --pages 3-3            # Single page (page 3)
pdf-reader extract <file> --layout --pages 2-10  # Layout + page range
```

Options:
- `--layout` — Maintains spatial positioning. Essential for tables, spreadsheets, multi-column docs.
- `--pages N-M` — Extract only pages N through M (1-based, inclusive).

### fetch — Download and extract PDF from URL

```bash
pdf-reader fetch <url>                    # Download, verify, extract with layout
pdf-reader fetch <url> report.pdf         # Also save a local copy
```

Downloads the PDF, verifies it has a valid `%PDF` header, then extracts text with layout preservation. Temporary files are cleaned up automatically.

### info — PDF metadata and file size

```bash
pdf-reader info <file>
```

Shows title, author, page count, page size, PDF version, and file size on disk.

### list — Find all PDFs in directory tree

```bash
pdf-reader list
```

Recursively lists all `.pdf` files with page count and file size.

### merge — Combine multiple PDFs into one

```bash
pdf-reader merge combined.pdf part1.pdf part2.pdf part3.pdf
```

First argument is the OUTPUT file, all following arguments are inputs (in order).

### split — Extract pages or burst into single pages

```bash
pdf-reader split report.pdf --pages 3-7              # Pages 3-7 -> report-pages-3-7.pdf
pdf-reader split report.pdf --pages 3-7 chapter2.pdf # Pages 3-7 -> chapter2.pdf
pdf-reader split report.pdf                          # Every page -> report-page-1.pdf, -2.pdf, ...
```

Page ranges are 1-based and inclusive. Without `--pages`, the PDF is burst into one file per page.

### rotate — Rotate pages

```bash
pdf-reader rotate scan.pdf +90                  # All pages 90° clockwise -> scan-rotated.pdf
pdf-reader rotate scan.pdf -90 fixed.pdf        # All pages 90° counter-clockwise
pdf-reader rotate scan.pdf 180 --pages 2-2      # Only page 2 upside down
```

Angles: `+90` (clockwise), `-90` (counter-clockwise), `180`.

### compress — Shrink PDF file size

```bash
pdf-reader compress big.pdf                # -> big-compressed.pdf
pdf-reader compress big.pdf small.pdf      # -> small.pdf
```

Uses ghostscript `/ebook` quality (150 DPI images) — good for email/messenger size limits.

## Important: write outputs to a writable directory

Attachments under `/workspace/extra/` are mounted READ-ONLY. Always write merge/split/rotate/compress outputs to the current working directory or `/tmp`, never next to the read-only input:

```bash
pdf-reader split /workspace/extra/attachments-in/oliver-1/doc.pdf --pages 1-3 /tmp/excerpt.pdf
```

## Telegram PDF attachments

When a user sends a PDF on Telegram, it is automatically saved to the `attachments/` directory. The message will include a path hint like:

> [PDF attached: attachments/document.pdf]

To read the attached PDF:

```bash
pdf-reader extract attachments/document.pdf --layout
```

## Example workflows

### Read a contract and summarize key terms

```bash
pdf-reader info attachments/contract.pdf
pdf-reader extract attachments/contract.pdf --layout
```

### Extract specific pages from a long report

```bash
pdf-reader info report.pdf                    # Check total pages
pdf-reader extract report.pdf --pages 1-3     # Executive summary
pdf-reader extract report.pdf --pages 15-20   # Financial tables
```

### Fetch and analyze a public document

```bash
pdf-reader fetch https://example.com/annual-report.pdf report.pdf
pdf-reader info report.pdf
```
