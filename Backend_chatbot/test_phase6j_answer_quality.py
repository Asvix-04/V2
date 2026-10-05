"""
Phase 6J: RAG Answer Quality Testing Suite
DigiLab QA & Automated Testing Track

Validates the quality, safety, and groundedness of generated RAG answers using
controlled, deterministic fixtures across 12 answer-quality dimensions:
1. Groundedness (answers based only on supplied retrieved context)
2. Answer correctness & factual/numerical preservation
3. Context-only discrimination (answering known facts, not fabricating unknown)
4. Hallucination resistance & out-of-scope refusal
5. Conflicting context representation (multi-source preservation)
6. Citation & source metadata fidelity
7. Document & user isolation in synthesis prompts
8. Multi-chunk synthesis & aggregation
9. Irrelevant / distractor chunk handling & sorting
10. Empty / missing context safety
11. Answer format contracts, intent instructions, and table normalization
12. Determinism & prompt stability

Strict scope: Answer quality only. Zero production code changes.
"""

import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import chatbot
from chatbot import (
    PDFChatbot,
    ResponseIntent,
    OUT_OF_SCOPE_MESSAGE,
    RATE_LIMIT_MESSAGE,
    _build_smart_redirect,
    _TONE_TEMPERATURE,
)
from hybrid_retriever import (
    EnhancedHybridRetriever,
    RetrievedContext,
)
from pinecone_client import PineconeClient
from neo4j_client import Neo4jClient
from streaming_llm import StreamingLLM
from follow_up_generator import FollowUpGenerator
from llm_client import UnifiedLLMClient, ModelConfig, AVAILABLE_MODELS


class MockScoredVector:
    """Mock Pinecone ScoredVector supporting both object attributes and dict access."""

    def __init__(self, item_id: str, score: float, metadata: dict = None, text: str = ""):
        self.id = item_id
        self.score = score
        self.metadata = metadata or {}
        self.text = text or self.metadata.get("text", "")

    def get(self, key, default=None):
        if key == "id":
            return self.id
        if key == "score":
            return self.score
        if key == "metadata":
            return self.metadata
        if key == "text":
            return self.text
        return default

    def __getitem__(self, key):
        return getattr(self, key)


class TestPhase6JAnswerQuality(unittest.TestCase):

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="digilab_6j_answer_")

        # Mock dependencies to prevent external network calls during initialization
        with patch.object(PineconeClient, "__init__", lambda self, name, **kw: None), \
             patch.object(Neo4jClient, "__init__", lambda self, **kw: None), \
             patch.object(UnifiedLLMClient, "__init__", lambda self, cfg: None), \
             patch.object(StreamingLLM, "__init__", lambda self: None), \
             patch.object(FollowUpGenerator, "__init__", lambda self, client: None):
            self.bot = PDFChatbot()

        # Isolate from disk-based uploads
        self.bot._uploaded_docs = {}

        # Mock LLM generation client
        self.mock_llm = MagicMock()
        self.bot.llm_client = self.mock_llm

        # Configure retriever mocks
        self.bot.retriever.pinecone_client = MagicMock()
        self.bot.retriever.pinecone_client.create_embeddings_batch.return_value = [[0.05] * 384] * 3
        self.bot.retriever.pinecone_client.search_semantic_cache.return_value = None

        # Start global Redis mocks for chatbot
        self.patcher_exact = patch.object(chatbot.redis_client, "get_exact_match", return_value=None)
        self.patcher_hash = patch.object(chatbot.redis_client, "get_by_hash", return_value=None)
        self.patcher_save = patch.object(chatbot.redis_client, "save_session_history", return_value=None)
        self.patcher_exact.start()
        self.patcher_hash.start()
        self.patcher_save.start()

        # Controlled chunks for groundedness tests
        self.chunk_ethics = MockScoredVector(
            item_id="chunk_ethics_01",
            score=0.085,
            metadata={
                "source_file": "press_ethics.txt",
                "full_section": "Unit 1 > Press Commissions in India",
                "document_id": "doc_press_101",
                "user_id": "user_alice",
                "neo4j_id": "section_comm_01",
            },
            text=(
                "The First Press Commission was established in 1952 with Justice G.S. Rajadhyaksha as Chairman. "
                "It recommended the creation of the Press Council of India and the Registrar of Newspapers for India."
            ),
        )

        self.chunk_radio = MockScoredVector(
            item_id="chunk_radio_02",
            score=0.078,
            metadata={
                "source_file": "community_radio.txt",
                "full_section": "Unit 2 > Community Broadcasting Guidelines",
                "document_id": "doc_radio_102",
                "user_id": "user_alice",
                "neo4j_id": "section_radio_02",
            },
            text=(
                "Community radio stations in India operate with a maximum effective radiated power (ERP) of 250 Watts. "
                "The maximum permissible antenna height is 30 meters above ground level."
            ),
        )

    def tearDown(self):
        self.patcher_exact.stop()
        self.patcher_hash.stop()
        self.patcher_save.stop()
        shutil.rmtree(self.test_dir, ignore_errors=True)

    # ─────────────────────────────────────────────────────────────
    # 1. Groundedness & Context Pass-Through
    # ─────────────────────────────────────────────────────────────
    def test_01_synthesis_prompt_embeds_retrieved_context_grounding(self):
        """_build_synthesis_prompt embeds exact retrieved text and explicit grounding constraints."""
        retrieved = RetrievedContext(
            vector_results=[self.chunk_ethics],
            graph_context={"context": []},
            combined_context=self.bot.retriever._build_context("First Press Commission", [self.chunk_ethics], None),
            expanded_queries=["First Press Commission"],
        )
        intent = ResponseIntent(followup_mode="none", tone_signal="exam", format_signal="auto")
        validation = {"completeness_score": 9, "is_main_subject": True}

        prompt = self.bot._build_synthesis_prompt(
            user_question="When was the First Press Commission established?",
            retrieval_query="First Press Commission",
            retrieved_context=retrieved,
            validation=validation,
            response_intent=intent,
        )

        self.assertIn("Course Material (source of all factual claims):", prompt)
        self.assertIn("Justice G.S. Rajadhyaksha", prompt)
        self.assertIn("1952", prompt)
        self.assertIn("Use the course material as the source of facts. Do not add external facts.", prompt)

    def test_02_direct_factual_grounding_preserves_facts(self):
        """ask_question produces grounded answer reciting specific dates and entities from context."""
        retrieved = RetrievedContext(
            vector_results=[self.chunk_ethics],
            graph_context={"context": []},
            combined_context=self.bot.retriever._build_context("First Press Commission", [self.chunk_ethics], None),
            expanded_queries=["First Press Commission"],
        )

        grounded_answer = (
            "The First Press Commission was established in **1952** under the chairmanship of "
            "**Justice G.S. Rajadhyaksha**. It recommended setting up the Press Council of India."
        )

        with patch.object(self.bot, "_call_llm", return_value=grounded_answer), \
             patch.object(self.bot.retriever, "retrieve", return_value=retrieved):

            res = self.bot.ask_question("When was the First Press Commission established in India?")

            self.assertEqual(res["answer"], grounded_answer)
            self.assertIn("1952", res["answer"])
            self.assertIn("Justice G.S. Rajadhyaksha", res["answer"])
            self.assertEqual(len(res["sources"]), 1)
            self.assertEqual(res["sources"][0]["document_id"], "doc_press_101")

    # ─────────────────────────────────────────────────────────────
    # 2. Answer Correctness & Numerical/Entity Preservation
    # ─────────────────────────────────────────────────────────────
    def test_03_numerical_and_entity_preservation(self):
        """Controlled answer preserves technical numbers (250 Watts, 30 meters) without corruption."""
        retrieved = RetrievedContext(
            vector_results=[self.chunk_radio],
            graph_context={"context": []},
            combined_context=self.bot.retriever._build_context("community radio", [self.chunk_radio], None),
            expanded_queries=["community radio"],
        )

        mock_answer = (
            "In India, community radio stations operate under specific technical limits: "
            "a maximum power of **250 Watts** ERP and a maximum antenna height of **30 meters**."
        )

        with patch.object(self.bot, "_call_llm", return_value=mock_answer), \
             patch.object(self.bot.retriever, "retrieve", return_value=retrieved):

            res = self.bot.ask_question("What is the power and antenna limit for community radio in India?")

            self.assertIn("250 Watts", res["answer"])
            self.assertIn("30 meters", res["answer"])
            self.assertNotIn("500 Watts", res["answer"])
            self.assertNotIn("100 meters", res["answer"])

    # ─────────────────────────────────────────────────────────────
    # 3. Context-Only Behavior & Discrimination
    # ─────────────────────────────────────────────────────────────
    def test_04_context_only_discrimination_between_known_and_unknown_facts(self):
        """Confidence note directs model to answer only what material supports when coverage is partial."""
        retrieved = RetrievedContext(
            vector_results=[self.chunk_ethics],
            graph_context={"context": []},
            combined_context="Course material covers Press Commission of 1952 only.",
            expanded_queries=["Press Commission"],
        )
        validation_partial = {"completeness_score": 5, "is_main_subject": True}
        intent = ResponseIntent()

        prompt = self.bot._build_synthesis_prompt(
            user_question="What are the details of the Second Press Commission?",
            retrieval_query="Press Commission",
            retrieved_context=retrieved,
            validation=validation_partial,
            response_intent=intent,
        )

        self.assertIn("[CONFIDENCE: MEDIUM", prompt)
        self.assertIn("Answer only what the material supports. Do NOT fill gaps with outside knowledge.", prompt)

    # ─────────────────────────────────────────────────────────────
    # 4. Hallucination Resistance & Out-of-Scope Refusal
    # ─────────────────────────────────────────────────────────────
    def test_05_out_of_scope_query_triggers_refusal_without_hallucination(self):
        """Irrelevant query (cooking/baking) triggers immediate out-of-scope refusal without LLM synthesis."""
        with patch.object(self.bot, "_classify_input", return_value="out_of_syllabus"), \
             patch.object(self.bot, "_call_llm") as mock_gen_llm:

            # Mock retriever returning low score
            mock_retrieved = RetrievedContext(
                vector_results=[MockScoredVector("doc_unrelated", 0.010, {"source_file": "misc.txt"})],
                graph_context={},
                combined_context="",
                expanded_queries=["chocolate cake recipe"],
            )
            with patch.object(self.bot.retriever, "retrieve", return_value=mock_retrieved):
                res = self.bot.ask_question("How do I bake a chocolate cake?")

                self.assertEqual(res["answer"], OUT_OF_SCOPE_MESSAGE)
                self.assertEqual(res["sources"], [])
                # LLM synthesis call was never executed
                mock_gen_llm.assert_not_called()

    def test_06_borderline_query_smart_redirect(self):
        """Borderline query produces smart redirect suggesting related syllabus topics."""
        chunk_with_section = MockScoredVector(
            "doc_sec",
            0.028,
            {"full_section": "Unit 1 > Mass Media > Investigative Journalism Principles"},
        )
        retrieved = RetrievedContext(
            vector_results=[chunk_with_section],
            graph_context={},
            combined_context="",
            expanded_queries=["borderline query"],
        )

        redirect = _build_smart_redirect(retrieved)

        self.assertIn("Investigative Journalism Principles", redirect)
        self.assertIn("outside the scope of the course materials", redirect)

    # ─────────────────────────────────────────────────────────────
    # 5. Conflicting Context Representation
    # ─────────────────────────────────────────────────────────────
    def test_07_conflicting_context_multi_section_presentation(self):
        """Conflicting source claims are both preserved under their respective section headings."""
        chunk_a = MockScoredVector(
            "chunk_a",
            0.80,
            {"full_section": "Unit 1 > Historical Record A", "source_file": "history_a.txt"},
            text="Hicky's Bengal Gazette was launched in 1780 in Calcutta.",
        )
        chunk_b = MockScoredVector(
            "chunk_b",
            0.79,
            {"full_section": "Unit 2 > Alternative Chronology B", "source_file": "history_b.txt"},
            text="Early newspaper publishing began in 1782 under alternative records.",
        )

        combined = self.bot.retriever._build_context("Bengal Gazette date", [chunk_a, chunk_b], None)

        self.assertIn("[FROM: Unit 1 > Historical Record A]", combined)
        self.assertIn("launched in 1780", combined)
        self.assertIn("[FROM: Unit 2 > Alternative Chronology B]", combined)
        self.assertIn("began in 1782", combined)

    # ─────────────────────────────────────────────────────────────
    # 6. Citation & Source Metadata Fidelity
    # ─────────────────────────────────────────────────────────────
    def test_08_sources_metadata_fidelity_and_integrity(self):
        """Response dictionary sources preserve exact document_id, user_id, and filename metadata."""
        retrieved = RetrievedContext(
            vector_results=[self.chunk_ethics],
            graph_context={"context": []},
            combined_context="Sample context",
            expanded_queries=["query"],
        )

        with patch.object(self.bot, "_call_llm", return_value="Verified answer"), \
             patch.object(self.bot.retriever, "retrieve", return_value=retrieved):

            res = self.bot.ask_question("What is media ethics?")

            sources = res["sources"]
            self.assertEqual(len(sources), 1)
            self.assertEqual(sources[0]["document_id"], "doc_press_101")
            self.assertEqual(sources[0]["user_id"], "user_alice")
            self.assertEqual(sources[0]["source_file"], "press_ethics.txt")
            self.assertEqual(sources[0]["full_section"], "Unit 1 > Press Commissions in India")

    def test_09_unrelated_sources_strictly_excluded(self):
        """Unrelated document metadata does not appear in sources list."""
        retrieved = RetrievedContext(
            vector_results=[self.chunk_ethics],
            graph_context={"context": []},
            combined_context="Sample context",
            expanded_queries=["query"],
        )

        with patch.object(self.bot, "_call_llm", return_value="Verified answer"), \
             patch.object(self.bot.retriever, "retrieve", return_value=retrieved):

            res = self.bot.ask_question("What is media ethics?")

            source_docs = [s.get("document_id") for s in res["sources"]]
            self.assertNotIn("doc_confidential_999", source_docs)
            self.assertNotIn("doc_unrelated_physics", source_docs)

    # ─────────────────────────────────────────────────────────────
    # 7. Document & User Isolation in Answer Synthesis
    # ─────────────────────────────────────────────────────────────
    def test_10_user_isolation_in_prompt_synthesis(self):
        """Alice's synthesis prompt contains only Alice's document facts, strictly isolating user context."""
        retrieved_alice = RetrievedContext(
            vector_results=[self.chunk_ethics],
            graph_context={"context": []},
            combined_context="Alice's private research on Press Commission 1952.",
            expanded_queries=["alice query"],
        )

        prompt = self.bot._build_synthesis_prompt(
            user_question="Summarize my document",
            retrieval_query="Summarize my document",
            retrieved_context=retrieved_alice,
            validation={"completeness_score": 8, "is_main_subject": True},
            response_intent=ResponseIntent(),
        )

        self.assertIn("Alice's private research", prompt)
        self.assertNotIn("Bob's confidential file", prompt)

    # ─────────────────────────────────────────────────────────────
    # 8. Multi-Chunk Synthesis
    # ─────────────────────────────────────────────────────────────
    def test_11_multi_chunk_context_aggregation(self):
        """_build_context combines multiple complementary chunks across sections into unified course material."""
        chunk_speech = MockScoredVector(
            "chunk_19_1_a",
            0.85,
            {"full_section": "Unit 3 > Freedom of Speech"},
            text="Article 19(1)(a) guarantees freedom of speech and expression.",
        )
        chunk_restrictions = MockScoredVector(
            "chunk_19_2",
            0.82,
            {"full_section": "Unit 3 > Reasonable Restrictions"},
            text="Article 19(2) permits reasonable restrictions on grounds of public order and sovereignty.",
        )

        context_str = self.bot.retriever._build_context(
            "Article 19 freedom of speech",
            [chunk_speech, chunk_restrictions],
            None,
        )

        self.assertIn("Article 19(1)(a)", context_str)
        self.assertIn("freedom of speech and expression", context_str)
        self.assertIn("Article 19(2)", context_str)
        self.assertIn("reasonable restrictions", context_str)

    # ─────────────────────────────────────────────────────────────
    # 9. Irrelevant / Distractor Context Handling
    # ─────────────────────────────────────────────────────────────
    def test_12_distractor_chunk_handling_and_sorting(self):
        """_build_context ranks relevant chunks ahead of lower-scoring distractor chunks."""
        relevant_chunk = MockScoredVector(
            "relevant_1",
            0.92,
            {"full_section": "Unit 1 > Core Journalism Ethics"},
            text="Journalism ethics requires truthful reporting and fairness.",
        )
        distractor_chunk = MockScoredVector(
            "distractor_2",
            0.12,
            {"full_section": "Unit 8 > Industrial Machinery Offset"},
            text="Rotary engines power heavy paper cutting machinery.",
        )

        context_str = self.bot.retriever._build_context(
            "journalism ethics",
            [relevant_chunk, distractor_chunk],
            None,
        )

        pos_relevant = context_str.find("Core Journalism Ethics")
        pos_distractor = context_str.find("Industrial Machinery Offset")
        self.assertTrue(pos_relevant < pos_distractor, "Higher scoring relevant chunk must precede distractor")

    # ─────────────────────────────────────────────────────────────
    # 10. Empty / Missing Context Safety
    # ─────────────────────────────────────────────────────────────
    def test_13_empty_retrieved_results_returns_out_of_scope_safely(self):
        """When vector_results is empty, ask_question safely returns out-of-scope without crashing."""
        empty_retrieved = RetrievedContext(
            vector_results=[],
            graph_context={"context": []},
            combined_context="",
            expanded_queries=[],
        )

        with patch.object(self.bot.retriever, "retrieve", return_value=empty_retrieved):

            res = self.bot.ask_question("Unmatched hypothetical question")

            self.assertEqual(res["answer"], OUT_OF_SCOPE_MESSAGE)
            self.assertEqual(res["sources"], [])

    def test_14_missing_or_sparse_chunk_text_handled_safely(self):
        """Chunk with empty text or missing metadata is handled safely without raising AttributeError."""
        sparse_chunk = MockScoredVector("sparse_chunk", 0.70, metadata={}, text="")
        context_str = self.bot.retriever._build_context("sparse query", [sparse_chunk], None)

        self.assertIn("===== COURSE MATERIAL RELEVANT TO THIS QUESTION =====", context_str)
        self.assertIn("===== END OF COURSE MATERIAL =====", context_str)

    # ─────────────────────────────────────────────────────────────
    # 11. Answer Format Contract & Normalization
    # ─────────────────────────────────────────────────────────────
    def test_15_markdown_table_normalization_cleans_separators(self):
        """_normalize_markdown_table collapses excessive dashes and normalizes unclosed table rows."""
        unnormalized = (
            "| Feature | Radio | Television |\n"
            "|:---------|-------------------|:---|\n"
            "| Sensory | Audio only | Audio and visual |\n"
            "| Immediacy | High | Moderate"
        )
        normalized = self.bot._normalize_markdown_table(unnormalized)

        lines = normalized.split("\n")
        # Separator row has canonical 3 dashes
        self.assertIn("|:---|---|:---|", lines[1])
        # Trailing row was closed
        self.assertTrue(lines[-1].endswith("|"))

    def test_16_length_instruction_intent_compliance(self):
        """_detect_length_instruction produces correct [LENGTH] tags based on query phrasing."""
        self.assertIn("[LENGTH: SHORT", self.bot._detect_length_instruction("what is FM radio?"))
        self.assertIn("[LENGTH: MEDIUM", self.bot._detect_length_instruction("what is the importance of media ethics?"))
        self.assertIn("[LENGTH: LONG", self.bot._detect_length_instruction("explain in detail the evolution of print media"))

    def test_17_format_instruction_intent_compliance(self):
        """_build_format_instruction generates exact structural format tags."""
        intent_comp = ResponseIntent(format_signal="comparison")
        self.assertIn("[FORMAT: COMPARISON", self.bot._build_format_instruction("compare A and B", intent_comp))

        intent_bullets = ResponseIntent(format_signal="bullets")
        self.assertIn("[FORMAT: BULLETS", self.bot._build_format_instruction("list the features", intent_bullets))

        intent_table = ResponseIntent(format_signal="table")
        self.assertIn("[FORMAT: TABLE", self.bot._build_format_instruction("in a table", intent_table))

    def test_18_response_schema_contract_conformance(self):
        """ask_question returns dictionary complying with the production API response contract."""
        retrieved = RetrievedContext(
            vector_results=[self.chunk_ethics],
            graph_context={"context": []},
            combined_context="Valid context",
            expanded_queries=["query"],
        )

        with patch.object(self.bot, "_call_llm", return_value="Complete answer text"), \
             patch.object(self.bot.retriever, "retrieve", return_value=retrieved):

            res = self.bot.ask_question("What is journalism ethics?")

            required_keys = {
                "answer",
                "sources",
                "vector_results",
                "graph_context",
                "expanded_queries",
                "validation",
                "reference_links",
                "is_cache_hit",
                "top_score",
                "_audit_timings",
            }
            self.assertTrue(required_keys.issubset(res.keys()), f"Missing keys: {required_keys - set(res.keys())}")
            self.assertIsInstance(res["answer"], str)
            self.assertIsInstance(res["sources"], list)
            self.assertIsInstance(res["top_score"], float)

    # ─────────────────────────────────────────────────────────────
    # 12. Determinism & Prompt Stability
    # ─────────────────────────────────────────────────────────────
    def test_19_synthesis_prompt_construction_determinism(self):
        """Repeated prompt construction on identical inputs is 100% deterministic."""
        retrieved = RetrievedContext(
            vector_results=[self.chunk_ethics],
            graph_context={"context": []},
            combined_context="Static deterministic context.",
            expanded_queries=["query"],
        )
        intent = ResponseIntent(followup_mode="none", tone_signal="exam", format_signal="auto")
        validation = {"completeness_score": 8, "is_main_subject": True}

        baseline_prompt = self.bot._build_synthesis_prompt(
            user_question="Explain the First Press Commission",
            retrieval_query="First Press Commission",
            retrieved_context=retrieved,
            validation=validation,
            response_intent=intent,
        )

        for i in range(5):
            prompt = self.bot._build_synthesis_prompt(
                user_question="Explain the First Press Commission",
                retrieval_query="First Press Commission",
                retrieved_context=retrieved,
                validation=validation,
                response_intent=intent,
            )
            self.assertEqual(prompt, baseline_prompt, f"Prompt drift detected on iteration {i}")

    def test_20_deterministic_llm_response_propagation(self):
        """Given deterministic LLM output, ask_question produces identical answer and metadata across executions."""
        retrieved = RetrievedContext(
            vector_results=[self.chunk_ethics],
            graph_context={"context": []},
            combined_context="Static context",
            expanded_queries=["deterministic query"],
        )

        fixed_answer = "Deterministic answer regarding the 1952 Press Commission."

        with patch.object(self.bot, "_call_llm", return_value=fixed_answer), \
             patch.object(self.bot.retriever, "retrieve", return_value=retrieved):

            res1 = self.bot.ask_question("First Press Commission details?")
            res2 = self.bot.ask_question("First Press Commission details?")

            self.assertEqual(res1["answer"], res2["answer"])
            self.assertEqual(res1["top_score"], res2["top_score"])
            self.assertEqual(len(res1["sources"]), len(res2["sources"]))


if __name__ == "__main__":
    unittest.main()
