"""
Hybrid Retriever v6 — SpellCorrector hardened against proper noun mangling.

v6 changes (SpellCorrector only — all other v5 logic unchanged):
  1. Proper noun protection: words capitalised in original query are skipped.
  2. Cutoff raised 0.85 → 0.92 (prevents "relativity"→"creativity").
  3. Minimum length guard: words ≤ 4 chars are never corrected.
  4. Explicit no-match behaviour: keep original word, never drop it.
"""
from typing import List, Dict, Any
from dataclasses import dataclass
from pinecone_client import PineconeClient
from neo4j_client import Neo4jClient
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

class LLMReformulator:
    def __init__(self):
        self.client = None; self.types = None; self.ready = False
        self.model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        try:
            from google import genai; from google.genai import types
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key: self.client = genai.Client(api_key=api_key); self.types = types; self.ready = True
        except Exception: pass

    def reformulate(self, query: str) -> List[str]:
        if not self.ready: return self._basic_fallback(query)
        try:
            prompt = (f"Rewrite this student question as 3 short search queries "
                      f"(3-8 words each) optimized for finding textbook content. "
                      f"Use key academic terms.\n\nQuestion: {query}\n\n"
                      f"Output ONLY 3 lines, one query per line. No numbering.")
            config = self.types.GenerateContentConfig(temperature=0.1, max_output_tokens=100)
            config.system_instruction = "Output exactly 3 search queries, one per line. Nothing else."
            response = self.client.models.generate_content(model=self.model, contents=prompt, config=config)
            lines = [re.sub(r'^[\d\.\-\*\)\]]+\s*', '', l).strip().lower()
                     for l in response.text.strip().split('\n') if l.strip() and len(l.strip()) > 5]
            return lines[:3] if lines else self._basic_fallback(query)
        except Exception: return self._basic_fallback(query)

    def _basic_fallback(self, query: str) -> List[str]:
        stopwords = {'what','is','the','a','an','and','or','but','in','on','at','to','for','of',
                     'with','by','how','does','do','are','explain','describe','discuss','define',
                     'tell','me','about','can','you','give','detail','please','between'}
        words = [w for w in query.lower().split() if w not in stopwords and len(w) > 3]
        return [' '.join(words)] if words else []

class SpellCorrector:
    """
    Course-vocabulary spell corrector — v6 hardened.

    Guards against proper noun mangling (Albert→alert, relativity→creativity).
    """
    def __init__(self, cache_path: str = "data/spell_vocab.json"):
        self.vocab = set()
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'r') as f: self.vocab = set(json.load(f))
            except Exception: pass

    def correct(self, query: str) -> str:
        if not self.vocab: return query

        # Detect proper nouns BEFORE lowercasing
        # Any word starting with uppercase in the original is treated as a proper noun
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

        for word in words:
            # Skip: stopword, already in vocab, too short, or proper noun
            if (word in stopwords or word in self.vocab
                    or len(word) <= 4 or word in proper_nouns):
                fixed.append(word); continue

            # Raised cutoff: 0.85 → 0.92 to prevent near-homophone swaps
            matches = get_close_matches(word, list(self.vocab), n=1, cutoff=0.92)
            if matches:
                fixed.append(matches[0]); changed = True
            else:
                fixed.append(word)  # No match — keep original unchanged

        result = ' '.join(fixed)
        if changed: print(f"🔧 Spell corrected: '{query}' → '{result}'")
        return result

class EnhancedHybridRetriever:
    def __init__(self, pinecone_index: str = "pdf-knowledge-base"):
        self.pinecone_client = PineconeClient(pinecone_index)
        self.neo4j_client = Neo4jClient()
        self.bm25 = BM25Index()
        self.reformulator = LLMReformulator()
        self.spell_corrector = SpellCorrector()

    def retrieve(self, query: str, top_k: int = 12) -> RetrievedContext:
        corrected = self.spell_corrector.correct(query)
        reformulated = self.reformulator.reformulate(corrected)
        all_queries = [corrected] + reformulated

        print(f"🔍 Original query: {query}")
        if corrected != query.lower().strip(): print(f"🔧 Corrected: {corrected}")
        print(f"📝 Search queries ({len(all_queries)}): {all_queries}")

        vector_ranks = {}; vector_meta = {}; vector_objects = {}
        for qi, q in enumerate(all_queries):
            k = 8 if qi == 0 else 4
            for rank, result in enumerate(self.pinecone_client.search(q, top_k=k)):
                rid = result.id if hasattr(result, 'id') else result.get('id', '')
                vector_ranks.setdefault(rid, []).append((qi, rank))
                if rid not in vector_meta:
                    vector_meta[rid] = result.metadata if hasattr(result, 'metadata') else result.get('metadata', {})
                    vector_objects[rid] = result

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
        BM25_WEIGHT = 0.7
        for rid, rp in bm25_ranks.items():
            for qi, rank in rp:
                rrf_scores[rid] = rrf_scores.get(rid, 0) + (1.0/(rrf_k+rank)) * BM25_WEIGHT

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

        graph_context = self._get_graph_context(final_results)
        combined = self._build_context(query, final_results, graph_context)
        return RetrievedContext(vector_results=final_results, graph_context=graph_context,
                                combined_context=combined, expanded_queries=all_queries)

    def _get_graph_context(self, results):
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
