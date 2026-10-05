"""
Phase 6A: Unit & Functional Testing Suite
DigiLab QA & Automated Testing Track

Covers critical unit & functional behaviors identified during the Phase 6A Audit:
1. Redis LocalMemoryCache LRU eviction boundary
2. Redis LocalMemoryCache TTL expiration & stale pruning
3. RedisManager hash key normalization (casing, whitespace, SHA-256)
4. RedisManager connection/timeout error graceful fallback to LocalMemoryCache
5. RedisManager session history serialization, storage, and retrieval
6. Deterministic hashing and hierarchical section ID generation (utils.py)
7. Fuzzy match ranking, substring scoring, and threshold filtering (utils.py)
8. RateLimiter sliding-window capacity, rejection, and time-based recovery (utils.py)
9. Document filename sanitization, path traversal prevention, and extension validation (api_server.py)
10. Document content sniffing for %PDF and .docx Word XML structures (api_server.py)
11. Discard upload cleanup of file and empty document parent directory (api_server.py)
12. Search question cleaner: markdown file attachment stripping (api_server.py)
13. Meaningful question validator: length, alphabet, and whitespace checks (api_server.py)
14. Levenshtein edit distance and course vocabulary spell correction (hybrid_retriever.py)
15. Rule-based reformulator: stopword dropping and domain synonym expansion (hybrid_retriever.py)
16. BM25Index tokenization: punctuation stripping, casing, and min-length filtering (hybrid_retriever.py)
17. TXTStructureParser heading classification and frontmatter noise filtering (txt_processor.py)
18. TXTStructureParser sliding-window chunking, short-section skip, and metadata structure (txt_processor.py)
"""

import io
import json
import os
import shutil
import sys
import tempfile
import time
import unittest
import zipfile
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
import redis

# Target production modules
from redis_client import LocalMemoryCache, RedisManager
from utils import (
    deterministic_hash,
    generate_section_id,
    fuzzy_match,
    RateLimiter,
)
from api_server import (
    _safe_document_filename,
    _looks_like_pdf,
    _looks_like_docx,
    _looks_like_supported_document,
    _discard_upload,
    _clean_question_for_search,
    _is_meaningful_question,
    PDF_UPLOAD_DIR,
)
from hybrid_retriever import (
    SpellCorrector,
    RuleBasedReformulator,
    BM25Index,
)
from txt_processor import TXTStructureParser, DocumentSection


class TestPhase6AUnitFunctional(unittest.TestCase):
    """Deterministic, isolated unit and functional tests for DigiLab Phase 6A."""

    # ─────────────────────────────────────────────────────────────
    # 1. Redis LocalMemoryCache LRU eviction
    # ─────────────────────────────────────────────────────────────
    def test_01_local_memory_cache_lru_eviction(self):
        """LocalMemoryCache evicts least-recently-used entry when capacity is exceeded."""
        cache = LocalMemoryCache(max_entries=3)
        cache.set("k1", "v1")
        cache.set("k2", "v2")
        cache.set("k3", "v3")

        # Touch k1 to make k2 the least recently used
        self.assertEqual(cache.get("k1"), "v1")

        # Adding k4 must evict k2 (not k1, which was recently accessed)
        cache.set("k4", "v4")

        self.assertEqual(cache.get("k1"), "v1")
        self.assertIsNone(cache.get("k2"), "k2 should have been evicted by LRU policy")
        self.assertEqual(cache.get("k3"), "v3")
        self.assertEqual(cache.get("k4"), "v4")

    # ─────────────────────────────────────────────────────────────
    # 2. Redis LocalMemoryCache TTL expiration
    # ─────────────────────────────────────────────────────────────
    def test_02_local_memory_cache_ttl_expiration(self):
        """Entries past their TTL return None and are purged from memory."""
        cache = LocalMemoryCache(max_entries=10)

        # Store key with positive TTL and key with immediate expiration (0 TTL)
        cache.setex("alive", 60, "valid_data")
        cache.setex("expired", 0, "stale_data")

        self.assertEqual(cache.get("alive"), "valid_data")
        self.assertIsNone(cache.get("expired"), "Expired key should return None")

        # Simulated time jump
        with patch("time.time", return_value=time.time() + 100):
            self.assertIsNone(cache.get("alive"), "Key should expire after TTL window")

    # ─────────────────────────────────────────────────────────────
    # 3. RedisManager hash key normalization
    # ─────────────────────────────────────────────────────────────
    def test_03_redis_manager_hash_key_normalization(self):
        """Questions differing only in casing, tabs, and spacing yield identical canonical hash keys."""
        q1 = "What is media literacy?"
        q2 = "  what   is\tmedia   literacy?  "
        q3 = "WHAT IS MEDIA LITERACY?"

        k1 = RedisManager.get_hash_key(q1)
        k2 = RedisManager.get_hash_key(q2)
        k3 = RedisManager.get_hash_key(q3)

        self.assertEqual(k1, k2)
        self.assertEqual(k2, k3)
        self.assertTrue(k1.startswith("cache:response:"))
        self.assertEqual(len(k1), len("cache:response:") + 64)  # 64 hex chars for SHA-256

    # ─────────────────────────────────────────────────────────────
    # 4. RedisManager connection/timeout error graceful fallback
    # ─────────────────────────────────────────────────────────────
    def test_04_redis_manager_error_fallback(self):
        """RedisManager seamlessly falls back to LocalMemoryCache on Redis connection or timeout errors."""
        manager = RedisManager()
        mock_broken_client = MagicMock()
        mock_broken_client.get.side_effect = redis.ConnectionError("Redis connection refused")
        mock_broken_client.setex.side_effect = redis.TimeoutError("Redis socket timeout")

        manager.client = mock_broken_client

        # Save should catch TimeoutError and write to local_cache
        saved_key = manager.save_response("test question", {"answer": "fallback response"})
        self.assertTrue(saved_key.startswith("cache:response:"))

        # Get should catch ConnectionError and read from local_cache
        res = manager.get_exact_match("test question")
        self.assertIsNotNone(res)
        self.assertEqual(res.get("answer"), "fallback response")

        # Malformed JSON in cache safely returns None
        manager.local_cache.set(saved_key, "invalid { json")
        self.assertIsNone(manager.get_exact_match("test question"))

    # ─────────────────────────────────────────────────────────────
    # 5. RedisManager session history serialization & retrieval
    # ─────────────────────────────────────────────────────────────
    def test_05_redis_session_history_roundtrip(self):
        """Session history correctly serializes, stores, and deserializes list of turns."""
        manager = RedisManager()
        session_id = "session_test_abc_123"
        history = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi! How can I help?"},
        ]

        # Use local cache for isolated deterministic test
        manager.client = manager.local_cache
        manager.save_session_history(session_id, history)

        loaded = manager.get_session_history(session_id)
        self.assertEqual(loaded, history)

        # Missing session returns None
        self.assertIsNone(manager.get_session_history("non_existent_session"))

    # ─────────────────────────────────────────────────────────────
    # 6. Deterministic hash & hierarchical section ID generation
    # ─────────────────────────────────────────────────────────────
    def test_06_deterministic_hash_and_section_id(self):
        """deterministic_hash and generate_section_id produce stable, consistent IDs."""
        text = "Unit 1: History of Media"
        h1 = deterministic_hash(text)
        h2 = deterministic_hash(text)

        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 12)

        # generate_section_id combines hierarchy path
        path = ["Unit 1: Media", "1.1 Print Media", "1.1.1 Newspapers"]
        sec_id = generate_section_id(path)
        self.assertTrue(sec_id.startswith("section_"))
        self.assertEqual(len(sec_id), len("section_") + 12)

        # Same path always produces exact same ID
        self.assertEqual(sec_id, generate_section_id(path))
        # Different path produces different ID
        self.assertNotEqual(sec_id, generate_section_id(["Unit 2: Broadcasting"]))

    # ─────────────────────────────────────────────────────────────
    # 7. Fuzzy match ranking and threshold filtering
    # ─────────────────────────────────────────────────────────────
    def test_07_fuzzy_match_ranking_and_threshold(self):
        """fuzzy_match assigns substring matches high priority, filters by threshold, and sorts descending."""
        candidates = [
            "Media Ethics and Regulations",
            "History of Print Journalism",
            "Digital Communication Technologies",
            "Cooking and Recipes",
        ]

        # Direct substring match
        matches = fuzzy_match("Print Journalism", candidates, threshold=0.5)
        self.assertGreater(len(matches), 0)
        self.assertEqual(matches[0][0], "History of Print Journalism")
        self.assertEqual(matches[0][1], 0.9)

        # Irrelevant query returns empty when below threshold
        unrelated = fuzzy_match("Quantum Astrophysics", candidates, threshold=0.6)
        self.assertEqual(len(unrelated), 0)

        # Empty candidates returns empty list
        self.assertEqual(fuzzy_match("query", [], threshold=0.5), [])

    # ─────────────────────────────────────────────────────────────
    # 8. RateLimiter sliding-window capacity & recovery
    # ─────────────────────────────────────────────────────────────
    def test_08_rate_limiter_sliding_window(self):
        """RateLimiter enforces max_requests cap within sliding window and recovers after expiry."""
        limiter = RateLimiter(max_requests=3, window_seconds=10)
        ip = "192.168.1.100"

        # First 3 requests permitted
        self.assertTrue(limiter.is_allowed(ip))
        self.assertTrue(limiter.is_allowed(ip))
        self.assertTrue(limiter.is_allowed(ip))

        # 4th request within window blocked
        self.assertFalse(limiter.is_allowed(ip))

        # Different IP has independent bucket
        self.assertTrue(limiter.is_allowed("192.168.1.101"))

        # Time jump past 10s window allows new request
        with patch("time.time", return_value=time.time() + 11):
            self.assertTrue(limiter.is_allowed(ip))

    # ─────────────────────────────────────────────────────────────
    # 9. Document filename sanitization & traversal prevention
    # ─────────────────────────────────────────────────────────────
    def test_09_safe_document_filename_sanitization(self):
        """_safe_document_filename strips paths, rejects traversal, and enforces extension rules."""
        # Valid names
        self.assertEqual(_safe_document_filename("syllabus.pdf"), "syllabus.pdf")
        self.assertEqual(_safe_document_filename("lecture.docx"), "lecture.docx")

        # Path traversal stripped to base name
        self.assertEqual(_safe_document_filename("../../etc/passwd.pdf"), "passwd.pdf")
        self.assertEqual(_safe_document_filename("C:\\Users\\test\\upload.pdf"), "upload.pdf")
        self.assertEqual(_safe_document_filename("...hidden.pdf"), "hidden.pdf")

        # Empty / None rejected
        with self.assertRaises(HTTPException) as ctx:
            _safe_document_filename("")
        self.assertEqual(ctx.exception.status_code, 400)

        # Unsupported extension rejected
        with self.assertRaises(HTTPException) as ctx:
            _safe_document_filename("document.exe")
        self.assertEqual(ctx.exception.status_code, 400)

        # Legacy .doc rejected with specific advice
        with self.assertRaises(HTTPException) as ctx:
            _safe_document_filename("notes.doc")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Legacy .doc", ctx.exception.detail)

        # Word lock file rejected
        with self.assertRaises(HTTPException) as ctx:
            _safe_document_filename("~$lecture.docx")
        self.assertEqual(ctx.exception.status_code, 400)

    # ─────────────────────────────────────────────────────────────
    # 10. Document content sniffing (%PDF and .docx parts)
    # ─────────────────────────────────────────────────────────────
    def test_10_document_content_sniffing(self):
        """_looks_like_pdf and _looks_like_docx validate real file headers rather than trust extension alone."""
        temp_dir = tempfile.mkdtemp(prefix="digilab_sniff_test_")
        try:
            # 1. Valid PDF
            valid_pdf = os.path.join(temp_dir, "valid.pdf")
            with open(valid_pdf, "wb") as f:
                f.write(b"%PDF-1.5 test binary stream")
            self.assertTrue(_looks_like_pdf(valid_pdf))
            self.assertTrue(_looks_like_supported_document(valid_pdf, ".pdf"))

            # 2. Corrupt / fake PDF (renamed text file)
            fake_pdf = os.path.join(temp_dir, "fake.pdf")
            with open(fake_pdf, "wb") as f:
                f.write(b"Plain text payload without PDF magic")
            self.assertFalse(_looks_like_pdf(fake_pdf))
            self.assertFalse(_looks_like_supported_document(fake_pdf, ".pdf"))

            # 3. Valid Word .docx (ZIP with word/document.xml)
            valid_docx = os.path.join(temp_dir, "valid.docx")
            with zipfile.ZipFile(valid_docx, "w") as zf:
                zf.writestr("word/document.xml", "<w:document></w:document>")
            self.assertTrue(_looks_like_docx(valid_docx))
            self.assertTrue(_looks_like_supported_document(valid_docx, ".docx"))

            # 4. Plain ZIP renamed to .docx without Word parts
            plain_zip = os.path.join(temp_dir, "plain.docx")
            with zipfile.ZipFile(plain_zip, "w") as zf:
                zf.writestr("file.txt", "not word xml")
            self.assertFalse(_looks_like_docx(plain_zip))
            self.assertFalse(_looks_like_supported_document(plain_zip, ".docx"))
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    # ─────────────────────────────────────────────────────────────
    # 11. Discard upload cleanup of file and empty directory
    # ─────────────────────────────────────────────────────────────
    def test_11_discard_upload_cleanup(self):
        """_discard_upload removes target file and cleans up empty document directory."""
        temp_dir = tempfile.mkdtemp(prefix="digilab_cleanup_test_")
        try:
            sub_dir = os.path.join(temp_dir, "doc_user_123")
            os.makedirs(sub_dir, exist_ok=True)
            target_file = os.path.join(sub_dir, "bad_upload.pdf")
            with open(target_file, "w") as f:
                f.write("temporary bad upload")

            self.assertTrue(os.path.exists(target_file))

            with patch("api_server.PDF_UPLOAD_DIR", temp_dir):
                _discard_upload(target_file)

            # Target file deleted
            self.assertFalse(os.path.exists(target_file))
            # Empty parent sub_dir also removed
            self.assertFalse(os.path.exists(sub_dir))
            # Root temp_dir remains intact
            self.assertTrue(os.path.exists(temp_dir))
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    # ─────────────────────────────────────────────────────────────
    # 12. Search question cleaner (markdown attachment stripping)
    # ─────────────────────────────────────────────────────────────
    def test_12_clean_question_for_search(self):
        """_clean_question_for_search extracts user query by removing markdown attachment syntax."""
        raw = "[File: journalism_ethics.pdf](http://localhost:5000/uploads/doc_123/journalism_ethics.pdf) What are the main principles of journalistic ethics?"
        cleaned = _clean_question_for_search(raw)
        self.assertEqual(cleaned, "What are the main principles of journalistic ethics?")

        # Question without attachments left unchanged
        plain = "What is agenda setting theory?"
        self.assertEqual(_clean_question_for_search(plain), plain)

        # Empty question returns empty string
        self.assertEqual(_clean_question_for_search(""), "")
        self.assertEqual(_clean_question_for_search(None), "")

    # ─────────────────────────────────────────────────────────────
    # 13. Meaningful question validator
    # ─────────────────────────────────────────────────────────────
    def test_13_is_meaningful_question_validation(self):
        """_is_meaningful_question validates length, alphabet characters, and content."""
        # Valid questions
        self.assertTrue(_is_meaningful_question("What is media literacy?"))
        self.assertTrue(_is_meaningful_question("Yellow journalism definition"))

        # Empty / whitespace
        self.assertFalse(_is_meaningful_question(""))
        self.assertFalse(_is_meaningful_question("      "))
        self.assertFalse(_is_meaningful_question(None))

        # Too short (< 7 chars)
        self.assertFalse(_is_meaningful_question("Hello"))
        self.assertFalse(_is_meaningful_question("Why?"))

        # No alphabetic characters
        self.assertFalse(_is_meaningful_question("12345678"))
        self.assertFalse(_is_meaningful_question("!@#$%^&*()"))

    # ─────────────────────────────────────────────────────────────
    # 14. Levenshtein edit distance & SpellCorrector
    # ─────────────────────────────────────────────────────────────
    def test_14_levenshtein_distance_and_spell_correction(self):
        """SpellCorrector computes exact edit distance and corrects transposed course vocabulary."""
        # Levenshtein distance verification
        self.assertEqual(SpellCorrector._levenshtein("media", "media"), 0)
        self.assertEqual(SpellCorrector._levenshtein("media", "medix"), 1)  # single substitution
        self.assertEqual(SpellCorrector._levenshtein("media", "medias"), 1)  # single insertion
        self.assertEqual(SpellCorrector._levenshtein("media", "medai"), 2)  # transposition in standard Levenshtein
        self.assertEqual(SpellCorrector._levenshtein("", "test"), 4)
        self.assertEqual(SpellCorrector._levenshtein("test", ""), 4)

        # SpellCorrector vocabulary lookup
        corrector = SpellCorrector.__new__(SpellCorrector)
        corrector.vocab = {"journalism", "broadcasting", "misinformation"}

        # Single-edit typo corrected
        self.assertEqual(corrector.correct("journlism"), "journalism")
        self.assertEqual(corrector.correct("broadasting"), "broadcasting")

        # Unknown word preserved
        self.assertEqual(corrector.correct("cryptocurrency"), "cryptocurrency")

    # ─────────────────────────────────────────────────────────────
    # 15. Rule-based reformulator: synonym expansion & core queries
    # ─────────────────────────────────────────────────────────────
    def test_15_rule_based_reformulator(self):
        """RuleBasedReformulator drops stopwords, substitutes domain synonyms, and extracts core terms."""
        reformulator = RuleBasedReformulator()

        query = "what is the role of fake news in modern democracy?"
        alternatives = reformulator.reformulate(query)

        self.assertIsInstance(alternatives, list)
        self.assertGreater(len(alternatives), 0)

        # 'fake news' should expand to synonym (e.g. misinformation / disinformation)
        combined = " ".join(alternatives).lower()
        self.assertTrue(
            "misinformation" in combined or "disinformation" in combined or "propaganda" in combined,
            f"Expected synonym expansion for 'fake news', got: {alternatives}"
        )

        # Stopwords only query returns empty list
        self.assertEqual(reformulator.reformulate("what is the can you"), [])

    # ─────────────────────────────────────────────────────────────
    # 16. BM25Index tokenization rules
    # ─────────────────────────────────────────────────────────────
    def test_16_bm25_tokenization_rules(self):
        """BM25Index._tokenize strips punctuation, normalizes case, and filters words <= 2 chars."""
        bm25 = BM25Index.__new__(BM25Index)
        raw_text = "The quick, brown fox... jumped OVER an AI-powered dog!"
        tokens = bm25._tokenize(raw_text)

        # Punctuation removed, lowercased
        self.assertIn("quick", tokens)
        self.assertIn("brown", tokens)
        self.assertIn("fox", tokens)
        self.assertIn("jumped", tokens)
        self.assertIn("over", tokens)
        self.assertIn("powered", tokens)
        self.assertIn("dog", tokens)

        # Short words ('an', 'ai') <= 2 chars filtered out
        self.assertNotIn("an", tokens)
        self.assertNotIn("ai", tokens)

    # ─────────────────────────────────────────────────────────────
    # 17. TXTStructureParser heading classification & noise filtering
    # ─────────────────────────────────────────────────────────────
    def test_17_txt_structure_parser_classification_and_noise(self):
        """TXTStructureParser accurately identifies headings and ignores frontmatter noise."""
        parser = TXTStructureParser()

        # Heading classification
        line_type, title, level = parser._classify_line("UNIT 1 HISTORY OF JOURNALISM")
        self.assertEqual(line_type, "unit_heading")
        self.assertEqual(title, "HISTORY OF JOURNALISM")
        self.assertEqual(level, 1)

        line_type, title, level = parser._classify_line("Chapter 2: Ethics in Media")
        self.assertEqual(line_type, "chapter")
        self.assertEqual(title, "Ethics in Media")
        self.assertEqual(level, 1)

        line_type, title, level = parser._classify_line("1.1 Background and Origin")
        self.assertEqual(line_type, "section")
        self.assertEqual(level, 3)

        # Frontmatter noise identification
        self.assertTrue(parser._is_frontmatter_noise("MJM-027"))
        self.assertTrue(parser._is_frontmatter_noise("Adopted from Unit-4, MJM-021"))
        self.assertTrue(parser._is_frontmatter_noise("Programme Coordinator: Dr. Sharma"))
        self.assertFalse(parser._is_frontmatter_noise("Journalism is the activity of gathering news."))

    # ─────────────────────────────────────────────────────────────
    # 18. TXTStructureParser chunking window & metadata generation
    # ─────────────────────────────────────────────────────────────
    def test_18_txt_structure_parser_chunking_and_metadata(self):
        """TXTStructureParser.create_chunks generates sliding window chunks with comprehensive metadata."""
        parser = TXTStructureParser()

        # Create sample document sections: one short (skipped), one substantial (chunked)
        short_section = DocumentSection(
            id="sec_short",
            title="Short Section",
            content="Too short",
            level=1,
            section_path=["Short Section"],
            source_file="test.txt",
        )

        content_words = [f"word{i}" for i in range(120)]
        long_section = DocumentSection(
            id="sec_long",
            title="Comprehensive Media Analysis",
            content=" ".join(content_words),
            level=2,
            section_path=["Unit 1", "Comprehensive Media Analysis"],
            source_file="test.txt",
        )

        # Chunk with small chunk_size to test sliding window
        chunks = parser.create_chunks([short_section, long_section], chunk_size=50, overlap=10)

        # Short section must be skipped
        self.assertFalse(any(c["metadata"]["section_id"] == "sec_short" for c in chunks))

        # Long section must produce multiple overlapping chunks
        self.assertGreater(len(chunks), 1)

        first_chunk = chunks[0]
        self.assertEqual(first_chunk["metadata"]["section_id"], "sec_long")
        self.assertEqual(first_chunk["metadata"]["title"], "Comprehensive Media Analysis")
        self.assertEqual(first_chunk["metadata"]["full_section"], "Unit 1 > Comprehensive Media Analysis")
        self.assertEqual(first_chunk["metadata"]["source_file"], "test.txt")
        self.assertEqual(first_chunk["metadata"]["chunk_index"], "0")
        self.assertTrue(first_chunk["id"].startswith("sec_long_chunk"))


if __name__ == "__main__":
    unittest.main()
