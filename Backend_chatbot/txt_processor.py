import re
from typing import List, Dict, Tuple
from dataclasses import dataclass
from utils import generate_section_id

@dataclass
class DocumentSection:
    id: str
    title: str
    content: str
    level: int
    section_path: List[str]
    parent_id: str = None
    page: int = 1
    source_file: str = ""

class TXTStructureParser:
    """
    v6 accuracy fixes:

    FIX 1 — FRONTMATTER SANITIZATION:
        IGNOU combined_book.txt contains frontmatter lines like
        "Unit 2 Adopted from Unit-6, MJM-027 Coordinator:" that the parser
        was treating as section headings, creating false section paths such as
        "Introduction > MJM-027 > ..." which polluted all downstream chunk
        metadata. The correct sections (e.g. "Unit 1 History of Photography")
        were then either missing or hard to retrieve.

        Fix: Three-layer frontmatter filter:
          1. _course_code_re   — pure course code lines ("MJM-027")
          2. _frontmatter_re   — IGNOU editorial labels ("Block Editor", "Programme Coordinator")
          3. _adopted_from_re  — "Adopted from MJM-027" patterns

    FIX 2 — UNIT HEADING PATTERN:
        IGNOU units use the heading style "UNIT 1 HISTORY OF PHOTOGRAPHY"
        (all-caps, no colon). The old patterns required a colon/dot separator
        and missed these, so the unit's content was all dumped into the parent
        "Introduction" section instead of its own clean section.

        Fix: Added 'unit_heading' pattern that matches "UNIT N <TITLE>" as a
        level-1 section (same level as chapters and "Unit N: Title").

    FIX 3 — TITLE CLEANING:
        Strip embedded course code references from section titles that slipped
        through (e.g. "History of Photography MJM-027" → "History of Photography").

    IMPORTANT — RE-INDEXING REQUIRED:
        After deploying this file, you MUST re-run the full ingestion pipeline:
          python process_txt_pipeline.py    (re-parses and re-indexes into Pinecone/Neo4j)
          python build_bm25_cache.py        (rebuilds BM25 keyword index)
        Without re-indexing, the vector/BM25 stores still contain the old polluted
        section paths and this fix will have no effect on retrieval.
    """

    def __init__(self):
        # IGNOU course code pattern
        self._course_code_re = re.compile(
            r'^(MJM|MNM|BNM|MCJ|MCI|BESC|BCS|MCS|BCOS|BCOC|MEG|MHI|MAH|ECO|BSHF|MAJMC|MADJ)'
            r'[-\s]?\d{2,4}[A-Z]?\s*$',
            re.IGNORECASE
        )
        # IGNOU frontmatter editorial labels
        self._frontmatter_re = re.compile(
            r'adopted\s+from|adapted\s+from|revised\s+by|block\s+(editor|coordinator)'
            r'|programme\s+coordinator|course\s+editor|print\s+production'
            r'|indira\s+gandhi\s+national|school\s+of\s+journalism'
            r'|experts\s+committee|preparation\s+team|language\s+editor',
            re.IGNORECASE
        )
        # "Unit N Adopted from MJM-027" style lines
        self._adopted_from_re = re.compile(
            r'(unit\s+\d+.*adopted|adopted.*unit\s+\d+|from\s+(MJM|MNM|BNM|MAJMC)[-\s]?\d+)',
            re.IGNORECASE
        )

        self.patterns = {
            # NEW: "UNIT 1 HISTORY OF PHOTOGRAPHY" / "UNIT 8 PHOTO EDITING"
            # All-caps with no colon — dominant in IGNOU texts
            'unit_heading': re.compile(r'^UNIT\s+(\d+)[:\.]?\s+(.+)$', re.IGNORECASE),
            'chapter':      re.compile(r'^(Chapter|CHAPTER|CH\.?)\s+(\d+|[IVXLCDM]+)[.:]\s*(.+)$', re.IGNORECASE),
            'unit':         re.compile(r'^(Unit|UNIT)\s+(\d+)[.:]\s*(.+)$', re.IGNORECASE),
            'section':      re.compile(r'^(\d+(?:\.\d+)*)\s+(.+)$'),
            'subsection':   re.compile(r'^([A-Z])\.\s+(.+)$'),
            'bullet':       re.compile(r'^[•\-\*]\s+(.+)$'),
            'numbered':     re.compile(r'^\(\d+\)\s+(.+)$'),
        }

    # ──────────────────────────────────────────────

    def parse_txt_file(self, file_path: str) -> List[DocumentSection]:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        sections = []
        current_hierarchy = []
        current_content = []

        import os
        source_file = os.path.basename(file_path)

        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue

            # FIX 1: Skip frontmatter noise lines before classification
            if self._is_frontmatter_noise(line):
                continue

            line_type, title, level = self._classify_line(line)

            if line_type in ['unit_heading', 'chapter', 'unit', 'section', 'subsection']:
                if current_hierarchy and current_content:
                    self._save_section(current_hierarchy[-1], current_content, sections)
                    current_content = []

                # FIX 3: Clean stray course code refs from title
                title = self._clean_title(title)
                if not title:
                    continue

                section_path = [s.title for s in current_hierarchy] + [title]
                section_id = generate_section_id(section_path)

                parent_id = None
                if current_hierarchy:
                    while current_hierarchy and current_hierarchy[-1].level >= level:
                        current_hierarchy.pop()
                    if current_hierarchy:
                        parent_id = current_hierarchy[-1].id

                section_path = [s.title for s in current_hierarchy] + [title]

                section = DocumentSection(
                    id=section_id, title=title, content="", level=level,
                    section_path=section_path, parent_id=parent_id,
                    page=line_num // 50 + 1, source_file=source_file
                )
                sections.append(section)
                current_hierarchy.append(section)

            else:
                if current_hierarchy:
                    current_content.append(line)
                else:
                    if not any(s.title == "Introduction" for s in sections):
                        section = DocumentSection(
                            id=f"{source_file}_intro_0", title="Introduction",
                            content=line, level=0, section_path=["Introduction"],
                            parent_id=None, page=1, source_file=source_file
                        )
                        sections.append(section)
                        current_hierarchy.append(section)
                    else:
                        for s in sections:
                            if s.title == "Introduction":
                                s.content += " " + line; break

        if current_hierarchy and current_content:
            self._save_section(current_hierarchy[-1], current_content, sections)

        # FIX 1 post-process: remove course-code-only sections that slipped through
        sections = [s for s in sections if not self._is_noise_section(s)]

        print(f"✅ Parsed {len(sections)} sections from {source_file}")
        return sections

    # ── Frontmatter detection ────────────────────

    def _is_frontmatter_noise(self, line: str) -> bool:
        if self._course_code_re.match(line):
            return True
        if self._frontmatter_re.search(line):
            return True
        if self._adopted_from_re.search(line):
            return True
        return False

    def _clean_title(self, title: str) -> str:
        """Remove trailing course code references embedded in titles."""
        title = re.sub(
            r'\s+(MJM|MNM|BNM|MCJ|MAJMC|MADJ|SOJNMS)[-\s]?\d*[A-Z]?\s*$',
            '', title, flags=re.IGNORECASE
        ).strip().strip('.,;:')
        return title

    def _is_noise_section(self, section: DocumentSection) -> bool:
        t = section.title.strip()
        if self._course_code_re.match(t):
            return True
        if re.match(r'^[A-Z]{2,5}[-\s]?\d{2,4}[A-Z]?$', t):
            return True
        return False

    # ── Line classification ──────────────────────

    def _classify_line(self, line: str) -> Tuple[str, str, int]:
        # FIX 2: Check "UNIT N TITLE" first (most common in IGNOU)
        unit_heading_match = self.patterns['unit_heading'].match(line)
        if unit_heading_match:
            return 'unit_heading', unit_heading_match.group(2).strip(), 1

        unit_match = self.patterns['unit'].match(line)
        if unit_match:
            return 'unit', unit_match.group(3).strip(), 1

        chapter_match = self.patterns['chapter'].match(line)
        if chapter_match:
            return 'chapter', chapter_match.group(3).strip(), 1

        section_match = self.patterns['section'].match(line)
        if section_match:
            level = len(section_match.group(1).split('.')) + 1
            return 'section', section_match.group(2), level

        subsection_match = self.patterns['subsection'].match(line)
        if subsection_match:
            return 'subsection', subsection_match.group(2).strip(), 4

        bullet_match = self.patterns['bullet'].match(line)
        if bullet_match:
            return 'bullet', bullet_match.group(1).strip(), 5

        numbered_match = self.patterns['numbered'].match(line)
        if numbered_match:
            return 'numbered', numbered_match.group(1).strip(), 5

        return 'content', line, 99

    def _save_section(self, section, content_lines, sections):
        content = " ".join(content_lines).strip()
        section.content = content
        for i, s in enumerate(sections):
            if s.id == section.id:
                sections[i] = section; break

    # ── Chunking ─────────────────────────────────

    def create_chunks(self, sections: List[DocumentSection],
                      chunk_size: int = 400, overlap: int = 50) -> List[Dict]:
        chunks = []
        chunk_counter = 0

        for section in sections:
            if not section.content or len(section.content.strip()) < 20:
                continue
            words = section.content.strip().split()
            if len(words) < 10:
                continue

            for i in range(0, len(words), chunk_size - overlap):
                chunk_words = words[i:i + chunk_size]
                chunk_text = ' '.join(chunk_words)

                metadata = {
                    'section_id': section.id,
                    'title': section.title[:200],
                    'full_section': ' > '.join(section.section_path)[:300],
                    'level': str(section.level),
                    'parent_id': section.parent_id if section.parent_id else "ROOT",
                    'page': str(section.page),
                    'chunk_index': str(i // (chunk_size - overlap)),
                    'source_file': section.source_file,
                    'text': chunk_text[:1500],
                }
                metadata = {k: v for k, v in metadata.items() if v is not None}

                chunks.append({
                    'id': f"{section.id}_chunk{chunk_counter}",
                    'text': chunk_text,
                    'metadata': metadata,
                    'section_path': section.section_path
                })
                chunk_counter += 1

        print(f"✅ Created {len(chunks)} chunks from {len(sections)} sections")
        print("\n📋 Sample chunks created:")
        for i, chunk in enumerate(chunks[:3], 1):
            print(f"  {i}. Section: {chunk['metadata']['full_section'][:60]}")
            print(f"     Text preview: {chunk['text'][:80]}...")

        return chunks
