import os
import re
from glob import glob

import pdfplumber
from tqdm import tqdm
from unidecode import unidecode

PDF_DIR = "books"          # folder with 6 PDFs
OUTPUT_DIR = "processed"
COMBINED_FILE = "combined_book.txt"

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ---------- SMALL HELPERS ----------

def is_page_number(line: str) -> bool:
    """Detect plain or simple 'Page X' style page numbers."""
    stripped = line.strip()
    if not stripped:
        return False
    # Only digits
    if re.fullmatch(r"\d{1,4}", stripped):
        return True
    # Page 12, P. 12, etc.
    if re.fullmatch(r"(Page|PAGE|Pg\.?|PG\.?)\s*\d{1,4}", stripped):
        return True
    return False


def is_horizontal_rule(line: str) -> bool:
    """Lines made mostly of hyphens/underscores/equal signs."""
    stripped = line.strip()
    if not stripped:
        return False
    return bool(re.fullmatch(r"[-_=]{4,}", stripped))


def is_scanning_artifact(line: str) -> bool:
    """Isolated junk like '—', '·', or tiny symbol-only lines."""
    stripped = line.strip()
    # single long dash or bullet-only line
    if stripped in {"—", "–", "·", "•"}:
        return True
    # very short symbol-only strings (2–3 chars) with no letters/digits
    if len(stripped) <= 3 and not re.search(r"[A-Za-z0-9]", stripped):
        return True
    return False


def is_continued_on_next_page(line: str) -> bool:
    stripped = line.strip().lower()
    return "continued on next page" in stripped or "contd. on next page" in stripped


def normalize_bullets(line: str) -> str:
    """Convert various bullet symbols + indentation to simple hyphen bullets."""
    # Replace usual bullet symbols with hyphen
    line = re.sub(r"^[ \t]*[•·◦▪●►]+[ \t]*", "- ", line)

    # Book-specific: 'y ' used as bullet → convert to '- ' (more robust now)
    line = re.sub(r"^\s*y\s+", "- ", line)

    # Normalize numbered lists like "1)" or "1." at start → keep as is, ensure space
    line = re.sub(r"^([ \t]*\d+[\).])\s*", r"\1 ", line)

    return line


def is_heading_candidate(line: str) -> bool:
    """
    Heuristic: keep headings very clearly.
    We just detect them to avoid over-cleaning / merging.
    """
    stripped = line.strip()
    if not stripped:
        return False
    # Single short line, no period at end, contains letters
    if len(stripped) < 80 and not stripped.endswith((".", "?", "!", ":")):
        # ALL CAPS or Title Case
        if stripped.isupper():
            return True
        if stripped[0].isupper() and stripped.count(" ") <= 8:
            return True
    return False


def looks_like_table_row(line: str) -> bool:
    """
    Detect a table row in extracted text:
    - multiple columns separated by 2+ spaces
    - preferably contains some digits (for numeric values)
    """
    if "  " not in line:
        return False
    if not re.search(r"\d", line):
        return False
    if len(line.strip()) < 10:
        return False
    return True


def split_table_row(line: str):
    """Split a table row on 2+ spaces."""
    parts = re.split(r"\s{2,}", line.strip())
    return [p.strip() for p in parts if p.strip()]


def convert_table_block(block_lines):
    """
    Convert a block of table-like lines to bullet format:

    Table: <header summary>
    - col0: h1=val1, h2=val2, ...
    """
    if not block_lines:
        return []

    # First line = header row
    header_row = split_table_row(block_lines[0])
    if len(header_row) < 2:
        # Not a good table → return as-is
        return block_lines

    bullets = []
    table_title = "Table: " + ", ".join(header_row)
    bullets.append(table_title)

    for row in block_lines[1:]:
        cols = split_table_row(row)
        if not cols:
            continue
        # pad/truncate to header length
        if len(cols) < len(header_row):
            cols += [""] * (len(header_row) - len(cols))
        cols = cols[:len(header_row)]

        key = cols[0]
        kv_pairs = []
        for h, v in zip(header_row[1:], cols[1:]):
            if v:
                kv_pairs.append(f"{h}={v}")
        if kv_pairs:
            bullets.append(f"- {key}: " + ", ".join(kv_pairs))
        else:
            bullets.append(f"- {key}")

    return bullets


# ---------- PAGE-LEVEL PROCESSING ----------

def preprocess_page_text(raw_page_text: str) -> list[str]:
    """
    Process a single page:
    - split into lines
    - remove page numbers, rules, scanning artifacts, continued markers
    - normalize bullets
    """
    lines = raw_page_text.splitlines()
    cleaned_lines = []

    for line in lines:
        # Normalize unicode early
        line = unidecode(line)

        if is_page_number(line):
            continue
        if is_horizontal_rule(line):
            continue
        if is_scanning_artifact(line):
            continue
        if is_continued_on_next_page(line):
            continue

        # Remove ridiculous sequences of dots/underscores etc.
        line = re.sub(r"[._]{4,}", " ", line)

        # Normalize bullets / numbered lists
        line = normalize_bullets(line)

        # Strip trailing spaces, keep leading for now
        line = line.rstrip()

        cleaned_lines.append(line)

    return cleaned_lines


def remove_repeated_headers_footers(pages_lines: list[list[str]]) -> list[list[str]]:
    """
    Detect lines that repeat as first/last non-empty line on many pages
    and remove them (headers/footers).
    """
    first_lines = []
    last_lines = []

    for lines in pages_lines:
        non_empty = [l for l in lines if l.strip()]
        if not non_empty:
            continue
        first_lines.append(non_empty[0].strip())
        last_lines.append(non_empty[-1].strip())

    def get_repeated(candidates):
        counts = {}
        for l in candidates:
            counts[l] = counts.get(l, 0) + 1
        # Consider header/footer if appears on >= 3 pages
        return {l for l, c in counts.items() if c >= 3}

    header_candidates = get_repeated(first_lines)
    footer_candidates = get_repeated(last_lines)

    cleaned_pages = []
    for lines in pages_lines:
        new_lines = []
        non_empty = [i for i, l in enumerate(lines) if l.strip()]
        header_idx = non_empty[0] if non_empty else None
        footer_idx = non_empty[-1] if non_empty else None

        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped and i == header_idx and stripped in header_candidates:
                continue
            if stripped and i == footer_idx and stripped in footer_candidates:
                continue
            new_lines.append(line)
        cleaned_pages.append(new_lines)

    return cleaned_pages


def detect_and_convert_tables(lines: list[str]) -> list[str]:
    """
    Scan through lines, group table-like blocks, convert them.
    """
    result = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]

        if looks_like_table_row(line):
            block = [line]
            i += 1
            while i < n and looks_like_table_row(lines[i]):
                block.append(lines[i])
                i += 1
            conv = convert_table_block(block)
            result.extend(conv)
        else:
            result.append(line)
            i += 1

    return result


def merge_lines_to_paragraphs(lines: list[str]) -> str:
    """
    Merge lines into paragraphs while:
    - keeping headings as separate lines
    - keeping bullets / numbered lists as separate lines
    """
    processed = []
    buffer = []

    def flush_buffer():
        if buffer:
            processed.append(" ".join(buffer).strip())
            buffer.clear()

    for line in lines:
        stripped = line.strip()

        if not stripped:
            # blank line → paragraph break
            flush_buffer()
            processed.append("")  # keep empty line
            continue

        is_bullet = re.match(r"^(-|\d+[\).])\s+", stripped) is not None
        heading = is_heading_candidate(line)

        if is_bullet or heading:
            flush_buffer()
            processed.append(stripped)
        else:
            buffer.append(stripped)

    flush_buffer()

    # Collapse >2 empty lines to max 1
    final_lines = []
    empty_count = 0
    for l in processed:
        if l == "":
            empty_count += 1
            if empty_count <= 1:
                final_lines.append(l)
        else:
            empty_count = 0
            final_lines.append(l)

    return "\n".join(final_lines).strip()


def postprocess_global(text: str) -> str:
    """
    Global cleanups after paragraphs:
    - remove known running headers
    - fix spaced section numbers
    - normalize spaces/newlines
    """

    # 1) Remove running header "Digital Photography" only at line start
    text = re.sub(
        r"^Digital Photography\s+",
        "",
        text,
        flags=re.MULTILINE
    )

    # 2) Remove trailing "& Videography" phrases anywhere
    text = re.sub(r"\s*&\s*Videography", "", text)

    # Fix patterns like "1. 2.1" → "1.2.1"
    text = re.sub(r"(\d)\.\s+(\d)", r"\1.\2", text)

    # Normalize spaces and newlines
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# ---------- MAIN PIPELINE ----------

def extract_and_clean_pdf(pdf_path: str) -> str:
    pages_lines = []

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            raw = page.extract_text() or ""
            page_lines = preprocess_page_text(raw)
            pages_lines.append(page_lines)

    # Remove repeated headers / footers
    pages_lines = remove_repeated_headers_footers(pages_lines)

    # Flatten page lines with explicit page break (blank line)
    all_lines = []
    for pl in pages_lines:
        all_lines.extend(pl)
        all_lines.append("")

    # Table detection & conversion
    all_lines = detect_and_convert_tables(all_lines)

    # Merge lines into paragraphs, preserving bullets & headings
    cleaned_text = merge_lines_to_paragraphs(all_lines)

    # Global postprocessing (running headers, numbering, spaces)
    cleaned_text = postprocess_global(cleaned_text)

    return cleaned_text


def process_all_pdfs():
    pdf_paths = sorted(glob(os.path.join(PDF_DIR, "*.pdf")))
    if not pdf_paths:
        print(f"No PDFs found in folder: {PDF_DIR}")
        return

    combined_texts = []

    for pdf_path in tqdm(pdf_paths, desc="Processing PDFs"):
        filename = os.path.basename(pdf_path)
        print(f"\n=== {filename} ===")

        cleaned_text = extract_and_clean_pdf(pdf_path)

        out_path = os.path.join(
            OUTPUT_DIR,
            os.path.splitext(filename)[0] + ".txt"
        )
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(cleaned_text)

        combined_texts.append(f"\n\n=== {filename} ===\n\n" + cleaned_text)

    combined_path = os.path.join(OUTPUT_DIR, COMBINED_FILE)
    with open(combined_path, "w", encoding="utf-8") as f:
        f.write("\n".join(combined_texts))

    print("\nDone!")
    print(f"Individual cleaned files saved in: {OUTPUT_DIR}")
    print(f"Combined file: {combined_path}")


if __name__ == "__main__":
    process_all_pdfs()
