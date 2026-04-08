"""
Shared utilities for the RAG chatbot pipeline.

This module provides common functions used across multiple components
to ensure consistency (e.g., ID generation).
"""

import hashlib
from difflib import SequenceMatcher
from typing import List, Tuple
import time
from collections import defaultdict

SUPPORTED_LANGUAGES = {
    "english":   "en-IN",
    "hindi":     "hi-IN",
    "assamese":  "as-IN",
    "bengali":   "bn-IN",
    "urdu":      "ur-IN",
    "kannada":   "kn-IN",
    "nepali":    "ne-IN",
    "malayalam": "ml-IN",
    "konkani":   "kok-IN",
    "marathi":   "mr-IN",
    "kashmiri":  "ks-IN",
    "odia":      "od-IN",
    "sindhi":    "sd-IN",
    "punjabi":   "pa-IN",
    "sanskrit":  "sa-IN",
    "tamil":     "ta-IN",
    "santali":   "sat-IN",
    "telugu":    "te-IN",
    "manipuri":  "mni-IN",
    "bodo":      "brx-IN",
    "gujarati":  "gu-IN",
    "maithili":  "mai-IN",
    "dogri":     "doi-IN",
}

ISO_TO_SARVAM = {
    "en": "en-IN", "hi": "hi-IN", "bn": "bn-IN",
    "gu": "gu-IN", "kn": "kn-IN", "ml": "ml-IN",
    "mr": "mr-IN", "or": "od-IN", "pa": "pa-IN",
    "ta": "ta-IN", "te": "te-IN", "ur": "ur-IN",
    "as": "as-IN", "sa": "sa-IN", "ne": "ne-IN",
}

def deterministic_hash(value: str) -> str:
    """
    Generate a deterministic hash that is stable across Python processes.
    
    Uses SHA-256 truncated to 12 hex chars. This replaces Python's built-in
    hash() which is randomized per process (PYTHONHASHSEED).
    
    Args:
        value: The string to hash
        
    Returns:
        12-character hex string
    """
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:12]


def generate_section_id(section_path: List[str]) -> str:
    """
    Generate a consistent section ID from a section path.
    
    This is the SINGLE SOURCE OF TRUTH for section ID generation.
    Used by: txt_processor.py, neo4j_txt_builder.py, pinecone_client.py
    
    Args:
        section_path: List of section titles from root to current section
                      e.g., ["Unit 1: Radio Technology", "1.1 Introduction"]
    
    Returns:
        Section ID in format "section_{hash}"
    """
    path_str = ' > '.join(section_path)
    return f"section_{deterministic_hash(path_str)}"


def fuzzy_match(query: str, candidates: List[str], threshold: float = 0.6) -> List[Tuple[str, float]]:
    """
    Find fuzzy matches for a query string among candidates.
    
    Args:
        query: The string to match
        candidates: List of candidate strings to match against
        threshold: Minimum similarity ratio (0-1) to include in results
        
    Returns:
        List of (candidate, score) tuples sorted by score descending
    """
    matches = []
    query_lower = query.lower()
    
    for candidate in candidates:
        # Direct substring match gets high score
        if query_lower in candidate.lower() or candidate.lower() in query_lower:
            matches.append((candidate, 0.9))
            continue
            
        # Sequence matching for fuzzy similarity
        ratio = SequenceMatcher(None, query_lower, candidate.lower()).ratio()
        if ratio >= threshold:
            matches.append((candidate, ratio))
    
    return sorted(matches, key=lambda x: x[1], reverse=True)


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def build_metadata(result: dict, ref_links: list) -> dict:
    return {
        "total_sources": len(result["sources"]),
        "unique_sections": len(set([s.get("full_section", "") for s in result["sources"]])),
        "completeness_score": result.get("validation", {}).get("completeness_score") if result.get("validation") else None,
        "content_sufficient": (result.get("validation", {}).get("completeness_score", 0) or 0) >= 7,
        "query_expanded": len(result.get("expanded_queries", [])) > 1,
        #"reference_links_found": len(ref_links),
        "top_sources": [
            {
                "section": s.get("full_section", "Unknown")[:80],
                "page": s.get("page", "N/A"),
                "file": s.get("source_file", "N/A"),
            }
            for s in result["sources"][:3]
        ],
    }


# ─────────────────────────────────────────────────────────────
# Rate Limiter & Audio Cap
# ─────────────────────────────────────────────────────────────

MAX_AUDIO_BYTES = 1_000_000  # ~1 MB ≈ 30 seconds of WAV at 16kHz

class RateLimiter:
    """Simple in-memory per-IP rate limiter."""
    def __init__(self, max_requests: int = 5, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self.requests = defaultdict(list)

    def is_allowed(self, client_ip: str) -> bool:
        now = time.time()
        self.requests[client_ip] = [
            t for t in self.requests[client_ip] if now - t < self.window
        ]
        if len(self.requests[client_ip]) >= self.max_requests:
            return False
        self.requests[client_ip].append(now)
        return True

s2s_limiter = RateLimiter(max_requests=5, window_seconds=60)
