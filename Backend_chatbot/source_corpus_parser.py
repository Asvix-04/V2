"""
Parser for "source-divided" corpora: a single text file containing many
independent documents (e.g. journal-article PDFs), each one delimited by:

    ======================================================================
    === SOURCE: <article title> ===
    ======================================================================

Unlike txt_processor.TXTStructureParser (tuned for IGNOU textbook units with
"UNIT N" / "1.2 Subsection" headings), this parser does not try to detect
sub-headings inside each article — academic PDFs extracted to text rarely
have reliable heading structure, and numbered reference-list lines (e.g.
"21 Smith et al., 2019") get misread as section headings if you try.

Instead, each article between two SOURCE markers becomes exactly one
DocumentSection, correctly tagged with its own title/source_file so chunks
stay traceable back to the paper they came from. The resulting sections can
be fed straight into TXTStructureParser.create_chunks() for chunking.
"""
import re
from typing import List
from txt_processor import DocumentSection
from utils import generate_section_id

_TITLE_RE = re.compile(r'=== SOURCE:\s*(.*?)\s*===\s*$')
_DIVIDER_RE = re.compile(r'^=+$')


def parse_source_divided_file(file_path: str) -> List[DocumentSection]:
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    source_idxs = [i for i, l in enumerate(lines) if l.strip().startswith('=== SOURCE:')]
    print(f"Found {len(source_idxs)} source documents in {file_path}")

    sections = []
    skipped_empty = 0
    for n, idx in enumerate(source_idxs):
        match = _TITLE_RE.search(lines[idx].strip())
        title = match.group(1).strip() if match else f"untitled_{n}"

        end = source_idxs[n + 1] if n + 1 < len(source_idxs) else len(lines)
        content_lines = [
            s for l in lines[idx + 1:end]
            if (s := l.strip()) and not _DIVIDER_RE.match(s)
        ]
        content = ' '.join(content_lines).strip()

        if len(content) < 20:
            skipped_empty += 1
            continue

        section_id = generate_section_id([title, str(n)])
        sections.append(DocumentSection(
            id=section_id,
            title=title[:200],
            content=content,
            level=0,
            section_path=[title],
            parent_id=None,
            page=1,
            source_file=title[:200],
        ))

    print(f"Parsed {len(sections)} articles ({skipped_empty} skipped as empty/too short)")
    return sections
