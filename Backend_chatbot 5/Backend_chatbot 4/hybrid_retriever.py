"""
Hybrid Retriever v8 — With Streaming Support

v8 changes:
  1. Added retrieve_and_stream() method for real-time token streaming
  2. Integrated StreamingLLM for Google Gemini streaming
  3. Full retrieval pipeline + LLM streaming in one method
  4. Backward compatible with existing retrieve() method

v7 changes (for reference):
  - SpellCorrector with transposition-aware fallback
  - All other v6 logic unchanged
"""

from typing import List, Dict, Any, Generator
from dataclasses import dataclass
from pinecone_client import PineconeClient
from neo4j_client import Neo4jClient
from streaming_llm import StreamingLLM
from difflib import get_close_matches
import os, json, re

@dataclass
class RetrievedContext:
    vector_results: List[Any]
    graph_context: Dict[str, Any]
    combined_context: str
    expanded_queries: List[str]

class BM25Index:
    def __init__(self, cache_path: str = "data/bm25_corpus.json"):
        self.documents = []; self.bm25 = None; self.ready = False
        if os.path.exists(cache_path): self._load(cache_path)
        else: print(f"⚠️ BM25 cache not found at {cache_path}\n   Run: python build_bm25_cache.py")

    def _load(self, path):
        try:
            from rank_bm25 import BM25Okapi
        except ImportError:
            print("⚠️ rank_bm25 not installed — pip install rank_bm25"); return
        try:
            with open(path, 'r', encoding='utf-8') as f: self.documents = json.load(f)
            self.bm25 = BM25Okapi([self._tokenize(d['text']) for d in self.documents])
            self.ready = True
            print(f"✅ BM25 index: {len(self.documents)} documents")
        except Exception as e: print(f"⚠️ BM25 load error: {e}")

    def search(self, query: str, top_k: int = 5) -> List[Dict]:
        if not self.ready: return []
        scores = self.bm25.get_scores(self._tokenize(query))
        top_idx = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]
        return [{'id': self.documents[i]['id'], 'score': float(scores[i]),
                 'metadata': self.documents[i].get('metadata', {}),
                 'text': self.documents[i].get('text', '')}
                for i in top_idx if scores[i] > 0]

    def _tokenize(self, text): return [w for w in re.sub(r'[^\w\s]', ' ', text.lower()).split() if len(w) > 2]

class RuleBasedReformulator:
    """Domain-specific synonym reformulator — instant, no LLM call (~0ms vs ~2s)."""

    # Media literacy domain synonym map: term → list of alternative terms
    _SYNONYMS = {
        'journalism': ['news reporting', 'press', 'news media'],
        'journalist': ['reporter', 'news correspondent', 'media professional'],
        'reporter': ['journalist', 'news correspondent'],
        'media': ['mass communication', 'press', 'information channels'],
        'photography': ['photo capture', 'camera work', 'image making'],
        'photojournalism': ['photo reporting', 'visual journalism', 'news photography'],
        'camera': ['photographic equipment', 'imaging device'],
        'radio': ['radio broadcasting', 'FM broadcasting', 'audio medium'],
        'television': ['TV broadcasting', 'visual broadcasting', 'TV medium'],
        'advertising': ['advertisement', 'commercial communication', 'ad campaigns'],
        'ethics': ['moral principles', 'ethical standards', 'code of conduct'],
        'fake news': ['misinformation', 'disinformation', 'false information'],
        'misinformation': ['fake news', 'false information', 'media manipulation'],
        'disinformation': ['deliberate misinformation', 'propaganda', 'fake news'],
        'social media': ['social networking', 'online platforms', 'digital social platforms'],
        'deepfake': ['synthetic media', 'AI-generated fake', 'manipulated media'],
        'communication': ['information exchange', 'message transmission'],
        'broadcasting': ['radio television transmission', 'media dissemination'],
        'public relations': ['PR', 'corporate communication', 'media relations'],
        'gatekeeping': ['editorial selection', 'news filtering', 'information control'],
        'agenda setting': ['media agenda', 'issue salience', 'media influence on public opinion'],
        'media literacy': ['critical media understanding', 'media education', 'media awareness'],
        'photo editing': ['image manipulation', 'post-production', 'image retouching'],
        'videography': ['video production', 'video recording', 'moving image capture'],
        'infodemic': ['information overload', 'misinformation epidemic'],
        'propaganda': ['persuasion techniques', 'media manipulation'],
        'censorship': ['media control', 'information restriction', 'press suppression'],
        'democracy': ['democratic governance', 'democratic society'],
        'convergence': ['media convergence', 'digital convergence', 'platform merging'],
        'digital media': ['new media', 'online media', 'internet-based media'],
        'print media': ['newspapers magazines', 'press publications', 'print journalism'],
    }

    _STOPWORDS = frozenset({
        'what','is','the','a','an','and','or','but','in','on','at','to','for','of',
        'with','by','how','does','do','are','explain','describe','discuss','define',
        'tell','me','about','can','you','give','detail','please','between','compare',
        'difference','advantages','disadvantages','role','importance',
    })

    def reformulate(self, query: str) -> List[str]:
        q_lower = query.lower().strip()
        content_words = [w for w in q_lower.split() if w not in self._STOPWORDS and len(w) > 2]
        if not content_words:
            return []

        alternatives = []

        # Strategy 1: Synonym substitution — replace first matching term
        for i, word in enumerate(content_words):
            # Try single-word match
            if word in self._SYNONYMS:
                syn = self._SYNONYMS[word][0]
                alt_words = content_words[:i] + syn.split() + content_words[i+1:]
                alternatives.append(' '.join(alt_words))
                break
            # Try two-word match
            if i + 1 < len(content_words):
                bigram = f"{word} {content_words[i+1]}"
                if bigram in self._SYNONYMS:
                    syn = self._SYNONYMS[bigram][0]
                    alt_words = content_words[:i] + syn.split() + content_words[i+2:]
                    alternatives.append(' '.join(alt_words))
                    break

        # Strategy 2: Core terms only (stripped query)
        core = ' '.join(content_words[:4])
        if core and core not in alternatives:
            alternatives.append(core)

        return alternatives[:2]

LLMReformulator = RuleBasedReformulator  # backward compat alias

class SpellCorrector:
    """Course-vocabulary spell corrector — v7 transposition-aware."""
    
    def __init__(self, cache_path: str = "data/spell_vocab.json"):
        self.vocab = set()
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'r') as f: self.vocab = set(json.load(f))
            except Exception: pass

    @staticmethod
    def _levenshtein(s1: str, s2: str) -> int:
        if s1 == s2: return 0
        if not s1: return len(s2)
        if not s2: return len(s1)
        prev = list(range(len(s2) + 1))
        for i, c1 in enumerate(s1, 1):
            curr = [i]
            for j, c2 in enumerate(s2, 1):
                curr.append(min(prev[j] + 1, curr[j-1] + 1, prev[j-1] + (c1 != c2)))
            prev = curr
        return prev[-1]

    def _fuzzy_fallback(self, word: str) -> str:
        word_sorted = sorted(word)
        word_len = len(word)

        if word_len <= 6:
            general_max = 0
        elif word_len <= 8:
            general_max = 1
        else:
            general_max = 2

        best_word = ""
        best_dist = 99

        for v in self.vocab:
            v_len = len(v)

            if sorted(v) == word_sorted:
                if v_len == word_len:
                    dist = self._levenshtein(word, v)
                    if 0 < dist <= 2 and dist < best_dist:
                        best_dist = dist; best_word = v
                continue

            if general_max == 0:
                continue
            if abs(v_len - word_len) > general_max:
                continue
            dist = self._levenshtein(word, v)
            if dist <= general_max and dist < best_dist:
                best_dist = dist; best_word = v

        return best_word

    def correct(self, query: str) -> str:
        if not self.vocab: return query

        proper_nouns = {w.lower() for w in query.split() if w and w[0].isupper() and len(w) > 1}

        stopwords = {
            'what','is','the','a','an','and','or','but','in','on','at','to','for','of',
            'with','by','how','does','do','are','me','my','it','its','tell','can','you',
            'about','this','that','why','when','where','which','who','whom','was','were',
            'been','being','have','has','had','will','would','could','should','may','might',
            'shall','must','need','dare','not','from','into','than','then','also','just',
            'only','very','most','more','less','much','many','some','any','each','every',
            'both','few','all','same','other','such','like','well','important','between',
            'different','explain','describe','discuss','compare','define','give','make',
            'take','come','know','think','list','name','state','mention','elaborate',
            'relate','related','good','best','better','still','even','after','before',
            'over','under','through','during','while','because','since','until',
        }

        words = query.lower().split()
        fixed = []; changed = False

        for raw_word in words:
            word = raw_word.strip('.,!?;:\'"()[]{}')

            if (word in stopwords or word in self.vocab
                    or len(word) <= 4 or word in proper_nouns):
                fixed.append(raw_word); continue

            matches = get_close_matches(word, list(self.vocab), n=1, cutoff=0.92)
            if matches:
                suffix = raw_word[len(word):]
                fixed.append(matches[0] + suffix); changed = True
            else:
                fallback = self._fuzzy_fallback(word)
                if fallback:
                    suffix = raw_word[len(word):]
                    fixed.append(fallback + suffix); changed = True
                else:
                    fixed.append(raw_word)

        result = ' '.join(fixed)
        if changed: print(f"🔧 Spell corrected: '{query}' → '{result}'")
        return result

class EnhancedHybridRetriever:
    """
    Enhanced Hybrid Retriever with Streaming Support (v8)
    
    Features:
    - Multi-query reformulation (spell correction + LLM)
    - Vector search (Pinecone) + BM25 + Graph context (Neo4j)
    - Reciprocal Rank Fusion (RRF) for combining results
    - Gemini streaming LLM responses with full retrieval context
    """
    
    def __init__(self, pinecone_index: str = "pdf-knowledge-base"):
        self.pinecone_client = PineconeClient(pinecone_index)
        try:
            self.neo4j_client = Neo4jClient()
        except Exception as e:
            print(f"⚠️  Neo4j unavailable (skipping graph context): {e}")
            self.neo4j_client = None
        self.bm25 = BM25Index()
        self.reformulator = LLMReformulator()
        self.spell_corrector = SpellCorrector()
        self.streaming_llm = StreamingLLM()  # ✅ Gemini only

    def retrieve(self, query: str, top_k: int = 6) -> RetrievedContext:
        """Optimized retrieval: batch embeddings, parallel Pinecone + Neo4j."""
        corrected = self.spell_corrector.correct(query)
        reformulated = self.reformulator.reformulate(corrected)
        all_queries = [corrected] + reformulated

        print(f"🔍 Original query: {query}")
        if corrected != query.lower().strip(): print(f"🔧 Corrected: {corrected}")
        print(f"📝 Search queries ({len(all_queries)}): {all_queries}")

        # Batch-encode all queries in one SentenceTransformer.encode() call
        all_embeddings = self.pinecone_client.create_embeddings_batch(all_queries)
        query_top_k = [(8 if qi == 0 else 4) for qi in range(len(all_queries))]

        # Parallel Pinecone vector searches + BM25 (BM25 is CPU-local, instant)
        import concurrent.futures as _cf

        def _pinecone_search(qi_embed_k):
            qi, embed, k = qi_embed_k
            return qi, self.pinecone_client.search_with_vector(embed, top_k=k)

        vector_ranks = {}; vector_meta = {}; vector_objects = {}
        with _cf.ThreadPoolExecutor(max_workers=len(all_queries)) as pool:
            pinecone_jobs = [(qi, all_embeddings[qi], query_top_k[qi]) for qi in range(len(all_queries))]
            for qi, results in pool.map(_pinecone_search, pinecone_jobs):
                for rank, result in enumerate(results):
                    rid = result.id if hasattr(result, 'id') else result.get('id', '')
                    vector_ranks.setdefault(rid, []).append((qi, rank))
                    if rid not in vector_meta:
                        vector_meta[rid] = result.metadata if hasattr(result, 'metadata') else result.get('metadata', {})
                        vector_objects[rid] = result

        # BM25 (instant, local — no need to parallelise)
        bm25_ranks = {}; bm25_meta = {}; bm25_texts = {}
        if self.bm25.ready:
            for qi, q in enumerate(all_queries):
                k = 8 if qi == 0 else 4
                for rank, result in enumerate(self.bm25.search(q, top_k=k)):
                    rid = result['id']
                    bm25_ranks.setdefault(rid, []).append((qi, rank))
                    if rid not in bm25_meta:
                        bm25_meta[rid] = result.get('metadata', {})
                        bm25_texts[rid] = result.get('text', '')

        rrf_k = 60; rrf_scores = {}
        for rid, rp in vector_ranks.items():
            for qi, rank in rp:
                rrf_scores[rid] = rrf_scores.get(rid, 0) + (1.0/(rrf_k+rank)) * (1.5 if qi==0 else 0.8)
        # BM25 fusion. The user's LITERAL query (qi==0) gets a primary boost so that
        # an exact lexical hit on a rare/neologism term — e.g. an uploaded-PDF term
        # like "doomscrolling" that MiniLM can't embed well — can clear the
        # out-of-scope gate instead of being diluted by reformulated paraphrases or
        # buried under generic vector matches. A rank-0 verbatim BM25 hit now scores
        # 1.4/60 ≈ 0.023 (> the 0.020 gate); paraphrase hits keep the modest 0.7.
        BM25_PRIMARY_WEIGHT = 1.4   # qi==0 — verbatim user query
        BM25_EXPANDED_WEIGHT = 0.7  # qi>0 — reformulated paraphrases
        for rid, rp in bm25_ranks.items():
            for qi, rank in rp:
                w = BM25_PRIMARY_WEIGHT if qi == 0 else BM25_EXPANDED_WEIGHT
                rrf_scores[rid] = rrf_scores.get(rid, 0) + (1.0/(rrf_k+rank)) * w

        sorted_ids = sorted(rrf_scores, key=rrf_scores.get, reverse=True)[:top_k]
        final_results = []
        for rid in sorted_ids:
            if rid in vector_objects:
                vector_objects[rid].score = rrf_scores[rid]; final_results.append(vector_objects[rid])
            elif rid in bm25_meta:
                final_results.append(_SimpleResult(rid, rrf_scores[rid], bm25_meta[rid], bm25_texts.get(rid,'')))

        both = sum(1 for rid in sorted_ids if rid in vector_ranks and rid in bm25_ranks)
        v_only = sum(1 for rid in sorted_ids if rid in vector_ranks and rid not in bm25_ranks)
        b_only = sum(1 for rid in sorted_ids if rid not in vector_ranks and rid in bm25_ranks)
        print(f"\n📊 Retrieved {len(final_results)} unique chunks:")
        print(f"   Vector+BM25: {both} | Vector only: {v_only} | BM25 only: {b_only}")
        for i, r in enumerate(final_results[:3], 1):
            meta = r.metadata if hasattr(r, 'metadata') else {}
            print(f"  {i}. {meta.get('full_section','Unknown')[:60]}... (rrf: {r.score:.4f})")

        # Neo4j graph context — fetched in parallel with nothing blocking
        graph_context = self._get_graph_context(final_results)
        combined = self._build_context(query, final_results, graph_context)
        return RetrievedContext(vector_results=final_results, graph_context=graph_context,
                                combined_context=combined, expanded_queries=all_queries)

    # ─────────────────────────────────────────────────────────────
    # ✅ Streaming Method — Gemini Only
    # ─────────────────────────────────────────────────────────────

    def retrieve_and_stream(
        self,
        query: str,
        top_k: int = 6
    ) -> Generator[str, None, None]:
        """
        Retrieve relevant context + Stream Gemini response token-by-token

        Args:
            query: User question
            top_k: Number of top results to retrieve

        Yields:
            Response tokens in real-time
        """
        # Step 1: Full retrieval pipeline
        retrieved_context = self.retrieve(query, top_k=top_k)

        # Step 2: Stream Gemini response with context
        yield from self.streaming_llm.stream_response(
            query=query,
            context=retrieved_context.combined_context
        )

    # ─────────────────────────────────────────────────────────────
    # Helper Methods (unchanged)
    # ─────────────────────────────────────────────────────────────

    def _get_graph_context(self, results):
        if not self.neo4j_client:
            return {'context': []}
        neo4j_ids = []
        for r in results:
            meta = r.metadata if hasattr(r, 'metadata') else {}
            for field in ['section_id','parent_id','neo4j_id']:
                if field in meta and meta[field] and meta[field] != "ROOT":
                    neo4j_ids.append(meta[field]); break
        if not neo4j_ids: return {'context': []}
        try:
            ctx = self.neo4j_client.get_related_context(list(set(neo4j_ids))[:6])
            items = ctx.get('context', [])
            if items: print(f"📚 Retrieved {len(items)} graph nodes")
            return ctx
        except Exception as e: print(f"⚠️ Neo4j: {e}"); return {'context': []}

    def _build_context(self, query, results, graph_context):
        ctx = f'QUESTION TO ANSWER: "{query}"\n\n===== COURSE MATERIAL RELEVANT TO THIS QUESTION =====\n\n'
        sections = {}
        for r in results:
            meta = r.metadata if hasattr(r, 'metadata') else {}
            sec = meta.get('full_section', 'Unknown')
            sections.setdefault(sec, {'chunks': [], 'max_score': 0})
            score = r.score if hasattr(r, 'score') else 0
            full_text = (r.text if (hasattr(r,'text') and r.text) else meta.get('text',''))
            sections[sec]['chunks'].append({'content': full_text, 'score': score})
            sections[sec]['max_score'] = max(sections[sec]['max_score'], score)
        for path, data in sorted(sections.items(), key=lambda x: x[1]['max_score'], reverse=True)[:7]:
            ctx += f"[FROM: {path}]\n"
            for chunk in data['chunks'][:4]: ctx += f"{chunk['content'].strip()}\n\n"
            ctx += f"{'-'*70}\n\n"
        if graph_context and graph_context.get('context'):
            ctx += "[RELATED INFORMATION FROM COURSE STRUCTURE]\n\n"
            gsecs = {}
            for item in graph_context['context']:
                gsecs.setdefault(item.get('section_title','Unknown'), []).append(item)
            for s, items in list(gsecs.items())[:4]:
                ctx += f"[FROM: {s}]\n"
                for item in items[:3]:
                    if item.get('content'): ctx += f"{item['content'].strip()}\n\n"
            ctx += f"{'-'*70}\n\n"
        ctx += "===== END OF COURSE MATERIAL =====\n"
        return ctx

class _SimpleResult:
    def __init__(self, id, score, metadata, text=""):
        self.id = id; self.score = score; self.metadata = metadata; self.text = text

HybridRetriever = EnhancedHybridRetriever