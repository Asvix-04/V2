"""
db.py — MySQL connector for Omeka S database.

Fetches reference links from the `value` table by matching
item titles against keywords extracted from chatbot source sections.
"""

import os
import re
from typing import List, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

try:
    import mysql.connector
    from mysql.connector import Error
    # Enable MySQL connection
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    print("⚠️  mysql-connector-python not installed. Run: pip install mysql-connector-python")


# ─────────────────────────────────────────────────────────────
# Connection
# ─────────────────────────────────────────────────────────────

def get_connection():
    """Create and return a MySQL connection."""
    if not MYSQL_AVAILABLE:
        raise RuntimeError("mysql-connector-python is not installed.")

    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "127.0.0.1"),
        port=int(os.getenv("MYSQL_PORT", 3306)),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
        database=os.getenv("MYSQL_DATABASE", "u604560806_mile"),
        connect_timeout=5,
    )


# ─────────────────────────────────────────────────────────────
# Core Query
# ─────────────────────────────────────────────────────────────

def get_all_references() -> List[Dict]:
    """
    Fetch all items that have a URL (identifier) from the DB.
    Returns list of dicts with title and url.
    Cached at module level after first call.
    """
    query = """
        SELECT
            r.id AS item_id,
            MAX(CASE WHEN p.local_name = 'title'      THEN v.value END) AS title,
            MAX(CASE WHEN p.local_name = 'subject'    THEN v.value END) AS subject,
            MAX(CASE WHEN p.local_name = 'identifier' THEN v.value END) AS url
        FROM resource r
        JOIN value v    ON v.resource_id  = r.id
        JOIN property p ON v.property_id  = p.id
        GROUP BY r.id
        HAVING url IS NOT NULL
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query)
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        return results
    except Exception as e:
        print(f"❌ DB error fetching references: {e}")
        return []


# ─────────────────────────────────────────────────────────────
# Keyword Extraction
# ─────────────────────────────────────────────────────────────

# Words to ignore when building keyword set
STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "in", "on", "at", "to",
    "for", "with", "by", "from", "is", "are", "was", "were", "be",
    "as", "it", "its", "this", "that", "these", "those", "unit",
    "chapter", "section", "part", "introduction", "overview",
    "what", "how", "why", "when", "which", "who",
}

def _extract_keywords(text: str) -> set:
    """Extract meaningful keywords from a section name or title."""
    if not text:
        return set()
    words = re.findall(r'[a-zA-Z]+', text.lower())
    return {w for w in words if len(w) > 3 and w not in STOPWORDS}


def _score_match(title_keywords: set, query_keywords: set) -> float:
    """
    Return overlap score between title keywords and query keywords.
    Score = number of shared keywords / max possible overlap.
    """
    if not title_keywords or not query_keywords:
        return 0.0
    overlap = title_keywords & query_keywords
    return len(overlap) / len(title_keywords) if title_keywords else 0.0


# ─────────────────────────────────────────────────────────────
# Main Lookup Function
# ─────────────────────────────────────────────────────────────

def find_reference_links(
    sources: List[Dict],
    answer: str = "",
    min_score: float = 0.5,
    max_links: int = 5,
) -> List[Dict]:
    """
    Find reference links from the DB that match the chatbot's sources.

    Args:
        sources:    List of source metadata dicts from chatbot (each has
                    'full_section', 'title', 'source_file', etc.)
        answer:     The chatbot's answer text (used for additional keyword extraction)
        min_score:  Minimum keyword overlap score to include a link (0.0–1.0)
        max_links:  Maximum number of links to return

    Returns:
        List of dicts: [{"title": ..., "url": ..., "relevance_score": ...}]
    """
    if not MYSQL_AVAILABLE:
        return []

    # ── Build keyword set from all sources + answer ──
    query_keywords = set()

    for source in sources:
        for field in ("full_section", "title", "source_file"):
            query_keywords |= _extract_keywords(source.get(field, ""))

    # Also extract keywords from the full answer text
    query_keywords |= _extract_keywords(answer)

    if not query_keywords:
        return []

    # ── Fetch all DB references ──
    all_refs = get_all_references()
    if not all_refs:
        return []

    # ── Score each reference against query keywords ──
    scored = []
    seen_urls = set()

    for ref in all_refs:
        url = ref.get("url", "")
        title = ref.get("title", "") or ""
        subject = ref.get("subject", "") or ""

        if not url or not url.startswith("http"):
            continue
        if url in seen_urls:
            continue

        title_keywords = _extract_keywords(title) | _extract_keywords(subject)
        score = _score_match(title_keywords, query_keywords)

        if score >= min_score:
            scored.append({
                "title": title or url,
                "url": url,
                "relevance_score": round(score, 3),
            })
            seen_urls.add(url)

    # ── Sort by score descending, return top N ──
    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return scored[:max_links]


# ─────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────

def check_db_connection() -> bool:
    """Returns True if DB connection is healthy."""
    if not MYSQL_AVAILABLE:
        return False
    try:
        conn = get_connection()
        conn.close()
        return True
    except Exception as e:
        print(f"❌ DB connection failed: {e}")
        return False


if __name__ == "__main__":
    print("Testing DB connection...")
    if check_db_connection():
        print("✅ Connected!")
        refs = get_all_references()
        print(f"📚 Total references in DB: {len(refs)}")
    else:
        print("❌ Could not connect to DB.")
"""
db.py — MySQL connector for Omeka S database.

Fetches reference links from the `value` table by matching
item titles against keywords extracted from chatbot source sections.
"""

import os
import re
from typing import List, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

try:
    import mysql.connector
    from mysql.connector import Error
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False
    print("⚠️  mysql-connector-python not installed. Run: pip install mysql-connector-python")


# ─────────────────────────────────────────────────────────────
# Connection
# ─────────────────────────────────────────────────────────────

def get_connection():
    """Create and return a MySQL connection."""
    if not MYSQL_AVAILABLE:
        raise RuntimeError("mysql-connector-python is not installed.")

    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "127.0.0.1"),
        port=int(os.getenv("MYSQL_PORT", 3306)),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
        database=os.getenv("MYSQL_DATABASE", "u604560806_mile"),
        connect_timeout=5,
    )


# ─────────────────────────────────────────────────────────────
# Core Query
# ─────────────────────────────────────────────────────────────

def get_all_references() -> List[Dict]:
    """
    Fetch all items that have a URL (identifier) from the DB.
    Returns list of dicts with title and url.
    Cached at module level after first call.
    """
    query = """
        SELECT
            r.id AS item_id,
            MAX(CASE WHEN p.local_name = 'title'      THEN v.value END) AS title,
            MAX(CASE WHEN p.local_name = 'subject'    THEN v.value END) AS subject,
            MAX(CASE WHEN p.local_name = 'identifier' THEN v.value END) AS url
        FROM resource r
        JOIN value v    ON v.resource_id  = r.id
        JOIN property p ON v.property_id  = p.id
        GROUP BY r.id
        HAVING url IS NOT NULL
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query)
        results = cursor.fetchall()
        cursor.close()
        conn.close()
        return results
    except Exception as e:
        print(f"❌ DB error fetching references: {e}")
        return []


# ─────────────────────────────────────────────────────────────
# Keyword Extraction
# ─────────────────────────────────────────────────────────────

# Words to ignore when building keyword set
STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "in", "on", "at", "to",
    "for", "with", "by", "from", "is", "are", "was", "were", "be",
    "as", "it", "its", "this", "that", "these", "those", "unit",
    "chapter", "section", "part", "introduction", "overview",
    "what", "how", "why", "when", "which", "who",
}

def _extract_keywords(text: str) -> set:
    """Extract meaningful keywords from a section name or title."""
    if not text:
        return set()
    words = re.findall(r'[a-zA-Z]+', text.lower())
    return {w for w in words if len(w) > 3 and w not in STOPWORDS}


def _score_match(title_keywords: set, query_keywords: set) -> float:
    """
    Return overlap score between title keywords and query keywords.
    Score = number of shared keywords / max possible overlap.
    """
    if not title_keywords or not query_keywords:
        return 0.0
    overlap = title_keywords & query_keywords
    return len(overlap) / len(title_keywords)


# ─────────────────────────────────────────────────────────────
# Main Lookup Function
# ─────────────────────────────────────────────────────────────

def find_reference_links(
    sources: List[Dict],
    answer: str = "",
    min_score: float = 0.5,
    max_links: int = 5,
) -> List[Dict]:
    """
    Find reference links from the DB that match the chatbot's sources.

    Args:
        sources:    List of source metadata dicts from chatbot (each has
                    'full_section', 'title', 'source_file', etc.)
        answer:     The chatbot's answer text (used for additional keyword extraction)
        min_score:  Minimum keyword overlap score to include a link (0.0–1.0)
        max_links:  Maximum number of links to return

    Returns:
        List of dicts: [{"title": ..., "url": ..., "relevance_score": ...}]
    """
    if not MYSQL_AVAILABLE:
        return []

    # ── Build keyword set from all sources + answer ──
    query_keywords = set()

    for source in sources:
        for field in ("full_section", "title", "source_file"):
            query_keywords |= _extract_keywords(source.get(field, ""))

    # Also extract keywords from the full answer text
    query_keywords |= _extract_keywords(answer)

    if not query_keywords:
        return []

    # ── Fetch all DB references ──
    all_refs = get_all_references()
    if not all_refs:
        return []

    # ── Score each reference against query keywords ──
    scored = []
    seen_urls = set()

    for ref in all_refs:
        url = ref.get("url", "")
        title = ref.get("title", "") or ""
        subject = ref.get("subject", "") or ""

        if not url or not url.startswith("http"):
            continue
        if url in seen_urls:
            continue

        title_keywords = _extract_keywords(title) | _extract_keywords(subject)
        score = _score_match(title_keywords, query_keywords)

        if score >= min_score:
            scored.append({
                "title": title,
                "url": url,
                "clickable": f'<a href="{url}" target="_blank">{url}</a>',
                "relevance_score": round(score, 3),
            })
            seen_urls.add(url)

    # ── Sort by score descending, return top N ──
    scored.sort(key=lambda x: x["relevance_score"], reverse=True)
    return scored[:max_links]


# ─────────────────────────────────────────────────────────────
# Health Check
# ─────────────────────────────────────────────────────────────

def check_db_connection() -> bool:
    """Returns True if DB connection is healthy."""
    try:
        conn = get_connection()
        conn.close()
        return True
    except Exception as e:
        print(f"❌ DB connection failed: {e}")
        return False


# ─────────────────────────────────────────────────────────────
# Quick test (run: python db.py)
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Testing DB connection...")
    if check_db_connection():
        print("✅ Connected!")
        refs = get_all_references()
        print(f"📚 Total references in DB: {len(refs)}")
        if refs:
            print("\nSample entries:")
            for r in refs[:3]:
                print(f"  - {r['title']}")
                print(f"    {r['url']}")

        # Test matching
        test_sources = [{"full_section": "Media Literacy Skills and Social Media"}]
        links = find_reference_links(test_sources)
        print(f"\n🔗 Test match results ({len(links)} links):")
        for link in links:
            print(f"  [{link['relevance_score']}] {link['title']}")
            print(f"    {link['url']}")
    else:
        print("❌ Could not connect to DB. Check your .env settings.")
