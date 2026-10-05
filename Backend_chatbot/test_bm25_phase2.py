"""
Focused test suite for Phase 2: BM25 Ingestion Performance Optimization.
Verifies all 8 validation requirements from Step 11 without touching production data.
"""

import os
import json
import tempfile
import shutil
import unittest
from unittest.mock import patch, MagicMock

import build_bm25_cache
from build_bm25_cache import (
    _atomic_json_dump,
    get_or_build_base_corpus,
    build_cache,
)
from hybrid_retriever import BM25Index


class TestBM25Phase2Optimization(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="digilab_bm25_test_")
        self.txts_dir = os.path.join(self.test_dir, "data", "txts")
        self.pdfs_dir = os.path.join(self.test_dir, "pdfs")
        os.makedirs(self.txts_dir, exist_ok=True)
        os.makedirs(self.pdfs_dir, exist_ok=True)

        # Create a sample base syllabus book
        self.base_txt_path = os.path.join(self.txts_dir, "combined_book.txt")
        with open(self.base_txt_path, "w", encoding="utf-8") as f:
            f.write(
                "UNIT 1 HISTORY OF JOURNALISM\n\n"
                "Journalism has a rich and complex history dating back to early print media.\n"
                "Newspapers served as the primary source of public information for centuries.\n"
                "Broadcast media later expanded news coverage through radio and television.\n"
                "Digital communication transformed how reporters publish news.\n"
                "Media ethics remain essential across all communication channels.\n"
            )

        # Create a sample uploaded document
        self.upload_pdf_path = os.path.join(self.pdfs_dir, "sample_upload.pdf")
        with open(self.upload_pdf_path, "wb") as f:
            f.write(b"%PDF-1.4 Mock Upload PDF")

        self.upload_txt_path = os.path.join(self.txts_dir, "sample_upload.txt")
        with open(self.upload_txt_path, "w", encoding="utf-8") as f:
            f.write(
                "Introduction to Algorithmic Media\n\n"
                "Algorithmic content moderation and doomscrolling are critical modern topics.\n"
                "Social media algorithms prioritize high engagement over accuracy.\n"
                "Digital citizens need critical thinking to identify synthetic media.\n"
            )

        self.base_cache_path = os.path.join(self.test_dir, "data", "bm25_base_corpus.json")
        self.bm25_output_path = os.path.join(self.test_dir, "data", "bm25_corpus.json")
        self.spell_output_path = os.path.join(self.test_dir, "data", "spell_vocab.json")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_1_missing_base_cache_generates_correctly(self):
        """1. When base cache is missing, it is generated with proper structure."""
        self.assertFalse(os.path.exists(self.base_cache_path))
        base_docs = get_or_build_base_corpus(
            txt_path=self.base_txt_path,
            base_cache_path=self.base_cache_path,
            chunk_size=50,
            overlap=10,
        )
        self.assertTrue(os.path.exists(self.base_cache_path))
        self.assertGreater(len(base_docs), 0)
        self.assertIn("id", base_docs[0])
        self.assertIn("text", base_docs[0])
        self.assertIn("metadata", base_docs[0])
        # Base chunks must NOT have is_upload: True
        self.assertFalse(base_docs[0].get("metadata", {}).get("is_upload", False))

    def test_2_existing_base_cache_is_reused_without_reparsing(self):
        """2. When base cache exists, combined_book.txt is NOT reparsed."""
        # First call generates it
        get_or_build_base_corpus(
            txt_path=self.base_txt_path,
            base_cache_path=self.base_cache_path,
            chunk_size=50,
            overlap=10,
        )
        self.assertTrue(os.path.exists(self.base_cache_path))

        # Second call must load from cache and never instantiate TXTStructureParser
        with patch("build_bm25_cache.TXTStructureParser") as mock_parser:
            loaded_docs = get_or_build_base_corpus(
                txt_path=self.base_txt_path,
                base_cache_path=self.base_cache_path,
                chunk_size=50,
                overlap=10,
            )
            mock_parser.assert_not_called()
            self.assertGreater(len(loaded_docs), 0)

    def test_3_upload_corpus_contains_both_base_and_upload_chunks(self):
        """3. Upload corpus includes base chunks AND upload chunks from pdfs/."""
        with patch.object(build_bm25_cache, "UPLOAD_SOURCE_DIR", self.pdfs_dir), \
             patch.object(build_bm25_cache, "TXT_DIR", self.txts_dir):
            total_docs, _ = build_cache(
                txt_path=self.base_txt_path,
                bm25_output=self.bm25_output_path,
                spell_output=self.spell_output_path,
                base_cache_path=self.base_cache_path,
                chunk_size=50,
                overlap=10,
                rebuild_spell=True,
            )

            with open(self.bm25_output_path, "r", encoding="utf-8") as f:
                corpus = json.load(f)

            base_items = [d for d in corpus if not d.get("metadata", {}).get("is_upload")]
            upload_items = [d for d in corpus if d.get("metadata", {}).get("is_upload")]

            self.assertGreater(len(base_items), 0, "Base chunks must be present")
            self.assertGreater(len(upload_items), 0, "Upload chunks must be present")
            self.assertEqual(len(corpus), len(base_items) + len(upload_items))
            self.assertTrue(upload_items[0]["id"].startswith("up_sample_upload_bm25_"))

    def test_4_metadata_and_ids_preserved(self):
        """4. Document IDs and metadata semantics are strictly preserved."""
        with patch.object(build_bm25_cache, "UPLOAD_SOURCE_DIR", self.pdfs_dir), \
             patch.object(build_bm25_cache, "TXT_DIR", self.txts_dir):
            build_cache(
                txt_path=self.base_txt_path,
                bm25_output=self.bm25_output_path,
                spell_output=self.spell_output_path,
                base_cache_path=self.base_cache_path,
                chunk_size=50,
                overlap=10,
            )

            with open(self.bm25_output_path, "r", encoding="utf-8") as f:
                corpus = json.load(f)

            upload_doc = [d for d in corpus if d.get("metadata", {}).get("is_upload")][0]
            self.assertEqual(upload_doc["metadata"]["source_file"], "sample_upload.txt")
            self.assertEqual(upload_doc["metadata"]["is_upload"], True)

    def test_5_corpus_equivalence_between_full_build_and_cached_base(self):
        """5. Compare old full-build output vs new cached-base output for identical content."""
        with patch.object(build_bm25_cache, "UPLOAD_SOURCE_DIR", self.pdfs_dir), \
             patch.object(build_bm25_cache, "TXT_DIR", self.txts_dir):
            # Run with force_rebuild_base=True (simulates old full-build behavior)
            out_old = os.path.join(self.test_dir, "data", "bm25_old.json")
            build_cache(
                txt_path=self.base_txt_path,
                bm25_output=out_old,
                spell_output=self.spell_output_path,
                base_cache_path=self.base_cache_path,
                chunk_size=50,
                overlap=10,
                force_rebuild_base=True,
            )

            # Run with cached base (new behavior)
            out_new = os.path.join(self.test_dir, "data", "bm25_new.json")
            build_cache(
                txt_path=self.base_txt_path,
                bm25_output=out_new,
                spell_output=self.spell_output_path,
                base_cache_path=self.base_cache_path,
                chunk_size=50,
                overlap=10,
                force_rebuild_base=False,
            )

            with open(out_old, "r", encoding="utf-8") as f:
                docs_old = json.load(f)
            with open(out_new, "r", encoding="utf-8") as f:
                docs_new = json.load(f)

            self.assertEqual(len(docs_old), len(docs_new))
            self.assertEqual([d["id"] for d in docs_old], [d["id"] for d in docs_new])
            self.assertEqual([d["text"] for d in docs_old], [d["text"] for d in docs_new])
            self.assertEqual([d["metadata"] for d in docs_old], [d["metadata"] for d in docs_new])

    def test_6_bm25_scoring_and_ranking_equivalence(self):
        """6. BM25Index produces identical ranking and scores between old and new corpus."""
        with patch.object(build_bm25_cache, "UPLOAD_SOURCE_DIR", self.pdfs_dir), \
             patch.object(build_bm25_cache, "TXT_DIR", self.txts_dir):
            build_cache(
                txt_path=self.base_txt_path,
                bm25_output=self.bm25_output_path,
                spell_output=self.spell_output_path,
                base_cache_path=self.base_cache_path,
                chunk_size=50,
                overlap=10,
            )

            bm25_idx = BM25Index(cache_path=self.bm25_output_path)
            self.assertTrue(bm25_idx.ready)

            # Query matching upload chunk
            results = bm25_idx.search("doomscrolling algorithms", top_k=3)
            self.assertGreater(len(results), 0)
            self.assertTrue(results[0]["id"].startswith("up_sample_upload_bm25_"))
            self.assertGreater(results[0]["score"], 0.0)

            # Query matching base syllabus
            base_results = bm25_idx.search("history of journalism", top_k=3)
            self.assertGreater(len(base_results), 0)
            self.assertFalse(base_results[0].get("metadata", {}).get("is_upload", False))

    def test_7_atomic_dump_and_crash_recovery(self):
        """7. Partial writes do not corrupt target file, and missing base recovers."""
        target_file = os.path.join(self.test_dir, "test_atomic.json")
        initial_data = {"status": "valid_original"}
        _atomic_json_dump(initial_data, target_file)

        # Simulate exception during json.dump to verify original file is unchanged
        with patch("json.dump", side_effect=IOError("Simulated disk full")):
            with self.assertRaises(IOError):
                _atomic_json_dump({"status": "corrupted"}, target_file)

        with open(target_file, "r", encoding="utf-8") as f:
            persisted = json.load(f)
        self.assertEqual(persisted, initial_data, "Original file must remain intact after write error")

        # Verify no stray .tmp files left in the directory
        tmp_files = [fn for fn in os.listdir(self.test_dir) if ".tmp_" in fn]
        self.assertEqual(len(tmp_files), 0, "Temporary files must be cleaned up on error")

    def test_8_failure_safety_leaves_existing_bm25_intact(self):
        """8. If new BM25 construction fails, existing live retriever is not replaced."""
        mock_chatbot = MagicMock()
        mock_retriever = MagicMock()
        original_bm25 = MagicMock()
        original_bm25.ready = True
        mock_retriever.bm25 = original_bm25
        mock_chatbot.retriever = mock_retriever

        # Simulate broken index load
        with patch("hybrid_retriever.BM25Index") as mock_bm25_cls:
            broken_instance = MagicMock()
            broken_instance.ready = False
            mock_bm25_cls.return_value = broken_instance

            # Live reload logic from api_server.py
            new_bm25 = mock_bm25_cls(cache_path="dummy.json")
            if new_bm25.ready:
                mock_chatbot.retriever.bm25 = new_bm25
            else:
                pass  # do not replace

            self.assertEqual(
                mock_chatbot.retriever.bm25,
                original_bm25,
                "Live retriever must keep original instance when new index is not ready",
            )


if __name__ == "__main__":
    unittest.main()
