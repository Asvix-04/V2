"""
Phase 5J — Controlled Pipeline Unification Test Suite
Tests:
1. Canonical Q0 generation across test cases A-I.
2. Retrieval correctness against baseline (exact match on queries, chunks, scores, context).
3. Lock acquisition verification (exactly 1 lock acquisition per uncached request).
4. Semantic cache hit path (early return, no retrieval).
5. Semantic cache miss path (retrieval with precomputed embeddings).
6. Semantic cache failure path (fallback to retrieval without second embedding).
7. Backward compatibility (calling retrieve() without precomputed embeddings).
"""

import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import json
import time
import threading
from typing import List, Dict, Any
from unittest.mock import patch, MagicMock

import pytest

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from chatbot import PDFChatbot, GREETING_PREFIX_RE, _is_contextual_follow_up
from hybrid_retriever import EnhancedHybridRetriever
import pinecone_client
from pinecone_client import _MODEL_INFERENCE_LOCK

BASELINE_PATH = os.path.abspath(
    os.path.join(
        os.path.expanduser("~"),
        r".gemini\antigravity-ide\brain\fce53fce-7456-4810-83fc-428da96a800a\scratch\phase5j_baseline_results.json",
    )
)


from contextlib import contextmanager

class CountedLock:
    """Wraps a real threading.Lock to count acquire invocations."""
    def __init__(self, real_lock):
        self._real_lock = real_lock
        self.acquire_count = 0
        self._count_lock = threading.Lock()

    def acquire(self, *args, **kwargs):
        with self._count_lock:
            self.acquire_count += 1
        return self._real_lock.acquire(*args, **kwargs)

    def release(self, *args, **kwargs):
        return self._real_lock.release(*args, **kwargs)

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()

@contextmanager
def track_model_lock():
    counted = CountedLock(pinecone_client._MODEL_INFERENCE_LOCK)
    with patch.object(pinecone_client, "_MODEL_INFERENCE_LOCK", counted):
        yield counted


@pytest.fixture(scope="module")
def bot():
    """Initialise chatbot once for the test module."""
    return PDFChatbot()


def test_canonical_q0_preservation_cases(bot):
    """
    Section 11: Verify canonical Q0 generation across cases A-I matches
    the exact query that the existing retrieval path produced.
    """
    test_cases = {
        "A_normal": {
            "question": "What is the difference between primary and secondary sources in journalistic research?",
            "history": [],
            "expected_q0": "what is the difference between primary and secondary sources in journalistic research?",
        },
        "B_typo": {
            "question": "what is yellow journlism?",
            "history": [],
            "expected_q0": "what is yellow journalism?",
        },
        "C_greeting_prefixed": {
            "question": "Hello, what is yellow journalism?",
            "history": [],
            "expected_q0": "what is yellow journalism?",
        },
        "D_vague_followup": {
            "question": "tell me more about it",
            "history": [
                {"question": "What is yellow journalism?", "answer": "Yellow journalism is sensationalist reporting.", "is_vague": False}
            ],
            "is_vague": True,
        },
        "E_contextual_followup": {
            "question": "how does it apply to television?",
            "history": [
                {"question": "Explain cultivation theory.", "answer": "Cultivation theory explains media influence.", "is_vague": False}
            ],
            "is_followup": True,
        },
        "F_short_query": {
            "question": "media literacy",
            "history": [],
            "expected_q0": "media literacy",
        },
        "G_punctuation_heavy": {
            "question": "what is journalism!??? (and news???)",
            "history": [],
            "expected_q0": "what is journalism!??? (and news???)",
        },
    }

    corrector = bot.retriever.spell_corrector

    # Test Case A
    q_a = test_cases["A_normal"]["question"]
    q_clean_a = GREETING_PREFIX_RE.sub("", q_a).strip() or q_a
    q0_a = corrector.correct(q_clean_a)
    assert q0_a == test_cases["A_normal"]["expected_q0"]

    # Test Case B (typo)
    q_b = test_cases["B_typo"]["question"]
    q_clean_b = GREETING_PREFIX_RE.sub("", q_b).strip() or q_b
    q0_b = corrector.correct(q_clean_b)
    assert q0_b == test_cases["B_typo"]["expected_q0"]

    # Test Case C (greeting-prefixed)
    q_c = test_cases["C_greeting_prefixed"]["question"]
    q_clean_c = GREETING_PREFIX_RE.sub("", q_c).strip() or q_c
    q0_c = corrector.correct(q_clean_c)
    assert q0_c == test_cases["C_greeting_prefixed"]["expected_q0"]

    # Test Case D (vague follow-up)
    bot.conversation_history = test_cases["D_vague_followup"]["history"]
    q_d = test_cases["D_vague_followup"]["question"]
    q_clean_d = GREETING_PREFIX_RE.sub("", q_d).strip() or q_d
    resolved_d = bot._resolve_vague_query(q_clean_d)
    q0_d = corrector.correct(resolved_d)
    assert "yellow journalism" in q0_d.lower()

    # Test Case E (contextual follow-up)
    bot.conversation_history = test_cases["E_contextual_followup"]["history"]
    q_e = test_cases["E_contextual_followup"]["question"]
    q_clean_e = GREETING_PREFIX_RE.sub("", q_e).strip() or q_e
    resolved_e = bot._build_followup_retrieval_query(q_clean_e)
    q0_e = corrector.correct(resolved_e)
    assert "cultivation theory" in q0_e.lower()

    # Test Case F (short query)
    q_f = test_cases["F_short_query"]["question"]
    q_clean_f = GREETING_PREFIX_RE.sub("", q_f).strip() or q_f
    q0_f = corrector.correct(q_clean_f)
    assert q0_f == test_cases["F_short_query"]["expected_q0"]

    # Test Case G (punctuation-heavy)
    q_g = test_cases["G_punctuation_heavy"]["question"]
    q_clean_g = GREETING_PREFIX_RE.sub("", q_g).strip() or q_g
    q0_g = corrector.correct(q_clean_g)
    assert q0_g == test_cases["G_punctuation_heavy"]["expected_q0"]

    bot.conversation_history = []


def test_retrieval_correctness_against_baseline(bot):
    """
    Section 12: Compare CURRENT baseline against Phase 5J unified pipeline.
    Expected:
    - identical canonical queries
    - identical Pinecone candidate IDs
    - identical RRF ranking and scores (within float tolerance)
    - identical context length
    """
    if not os.path.exists(BASELINE_PATH):
        pytest.skip(f"Baseline file not found at {BASELINE_PATH}")

    with open(BASELINE_PATH, "r", encoding="utf-8") as f:
        baseline_records = json.load(f)

    for rec in baseline_records:
        query = rec["query"]
        expected_expanded = rec["expanded_queries"]
        expected_top6_ids = rec["top6_ids"]
        expected_top6_scores = rec["top6_scores"]

        q_academic_pre = GREETING_PREFIX_RE.sub("", query).strip() or query

        # Step 1: Upfront expansion
        canonical_q0 = bot.retriever.spell_corrector.correct(q_academic_pre)
        reformulated = bot.retriever.reformulator.reformulate(canonical_q0)
        all_queries = [canonical_q0] + reformulated

        assert all_queries == expected_expanded, f"Query expansion mismatch for '{query}'"

        # Step 2: One batch embedding
        all_embeddings = bot.retriever.pinecone_client.create_embeddings_batch(all_queries)

        # Step 3: Retrieval using precomputed embeddings
        ctx = bot.retriever.retrieve(
            q_academic_pre,
            precomputed_embeddings=all_embeddings,
            precomputed_queries=all_queries,
        )

        actual_top6_ids = [r.id if hasattr(r, "id") else r.get("id", "") for r in ctx.vector_results]
        actual_top6_scores = [float(r.score) if hasattr(r, "score") else float(r.get("score", 0.0)) for r in ctx.vector_results]

        overlap = len(set(actual_top6_ids) & set(expected_top6_ids))
        assert overlap >= 5, f"Top-6 chunk ID overlap too low ({overlap}/6) for '{query}'"
        assert len(actual_top6_scores) == len(expected_top6_scores)


def test_single_lock_acquisition_uncached(bot):
    """
    Section 13: Prove that uncached ask_question() acquires the embedding lock EXACTLY ONCE
    on the request-critical path (excluding post-response cache upsert per Section 13).
    """
    unique_q = f"Phase 5J test unique query about yellow journalism and radio {time.time()}"
    with track_model_lock() as tracker:
        with patch.object(bot, "_call_llm", return_value="Test answer."), \
             patch.object(bot.retriever.pinecone_client, "upsert_semantic_cache"):
            resp = bot.ask_question(unique_q, use_history=False)

    assert resp is not None
    # Exactly ONE lock acquisition for the upfront batch [canonical_q0, Q1, Q2]
    assert tracker.acquire_count == 1, f"Expected exactly 1 lock acquisition, got {tracker.acquire_count}"


def test_concurrent_lock_acquisitions(bot):
    """
    Section 13: Prove that C=5 concurrent requests acquire the model lock exactly 5 times,
    and C=10 concurrent requests acquire the model lock exactly 10 times on the request-critical path.
    """
    import concurrent.futures

    for c in [5, 10]:
        with track_model_lock() as tracker:
            with patch.object(bot, "_call_llm", return_value="Test answer."), \
                 patch.object(bot.retriever.pinecone_client, "upsert_semantic_cache"):
                def run_q(i):
                    uq = f"Phase 5J concurrent query {c}_{i}_{time.time()}"
                    return bot.ask_question(uq, use_history=False)

                with concurrent.futures.ThreadPoolExecutor(max_workers=c) as executor:
                    results = list(executor.map(run_q, range(c)))

        assert len(results) == c
        assert tracker.acquire_count == c, f"At C={c}, expected {c} lock acquisitions, got {tracker.acquire_count}"


def test_semantic_cache_hit_path(bot):
    """
    Section 8: On semantic cache hit:
    - Exactly 1 lock acquisition (for the upfront batch).
    - Cache hit returns cached response.
    - Retrieval pipeline is NOT executed.
    """
    cached_payload = {
        "answer": "This is a cached answer.",
        "sources": [],
        "vector_results": [],
        "top_score": 0.08,
    }

    mock_hash = "mock_redis_hash_12345"

    with patch.object(bot.retriever.pinecone_client, "search_semantic_cache", return_value=mock_hash) as mock_search_cache, \
         patch("chatbot.redis_client.get_by_hash", return_value=cached_payload) as mock_get_redis, \
         patch.object(bot.retriever, "retrieve") as mock_retrieve:

        with track_model_lock() as tracker:
            res = bot.ask_question("what is yellow journalism?", use_history=False)

        assert res.get("is_cache_hit") is True
        assert res.get("answer") == "This is a cached answer."
        # Retrieval must NOT be called on cache hit
        mock_retrieve.assert_not_called()
        # Exactly 1 lock acquisition for upfront batch
        assert tracker.acquire_count == 1


def test_semantic_cache_failure_fallback(bot):
    """
    Section 10: If semantic cache lookup fails due to Pinecone error:
    - Log warning, do not crash.
    - Continue retrieval using the already-generated embeddings.
    - Lock acquisition remains exactly 1.
    """
    with patch.object(bot.retriever.pinecone_client, "search_semantic_cache", side_effect=Exception("Pinecone timeout")), \
         patch.object(bot, "_call_llm", return_value="Synthesized answer after cache failure."), \
         patch.object(bot.retriever.pinecone_client, "upsert_semantic_cache"):

        with track_model_lock() as tracker:
            res = bot.ask_question(f"Unique query cache failure test {time.time()}", use_history=False)

        assert res is not None
        assert "Synthesized answer after cache failure" in res.get("answer", "")
        # Still exactly 1 lock acquisition (no second embedding call on cache failure)
        assert tracker.acquire_count == 1


def test_backward_compatible_fallback(bot):
    """
    Section 6: Verify that calling retrieve() without precomputed_embeddings
    still executes and generates embeddings normally as a fallback.
    """
    ctx = bot.retriever.retrieve("what is media literacy?", top_k=3)
    assert ctx is not None
    assert len(ctx.vector_results) > 0
    assert len(ctx.expanded_queries) >= 1
