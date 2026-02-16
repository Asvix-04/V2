from typing import List, Dict, Any
from dataclasses import dataclass
from pinecone_client import PineconeClient
from neo4j_client import Neo4jClient
from query_expander import QueryExpander

@dataclass
class RetrievedContext:
    vector_results: List[Dict]
    graph_context: Dict[str, Any]
    combined_context: str
    expanded_queries: List[str]

class EnhancedHybridRetriever:
    """
    Hybrid retrieval: Pinecone vector search + Neo4j graph context.
    
    Changes for 95% accuracy target:
    - top_k raised to 12 (from 10) for deeper retrieval
    - Up to 4 chunks per section (from 3)
    - Up to 7 sections in context (from 6)
    - Original query gets top_k=8 (from 6)
    - Graph context expanded to 3 items per section (from 2)
    - Context is clean course material — no formatting instructions
      (those live in the system prompt only)
    """
    
    def __init__(self, pinecone_index: str = "pdf-knowledge-base"):
        self.pinecone_client = PineconeClient(pinecone_index)
        self.neo4j_client = Neo4jClient()
        self.query_expander = QueryExpander()
    
    def retrieve(self, query: str, top_k: int = 12) -> RetrievedContext:
        """Perform enhanced hybrid retrieval with query expansion."""
        
        # 1. Expand query
        expanded_queries = self.query_expander.expand_query(query)
        print(f"🔍 Original query: {query}")
        print(f"📝 Expanded to {len(expanded_queries)} variations")
        
        # 2. Search with weighted approach
        all_vector_results = []
        
        # Original query — highest weight, deepest search
        original_results = self.pinecone_client.search(query, top_k=8)
        for result in original_results:
            result.score = result.score * 1.5  # Boost original
            all_vector_results.append(result)
        
        # Expanded queries — use all expansions (up to 5)
        for expanded_query in expanded_queries[1:6]:
            results = self.pinecone_client.search(expanded_query, top_k=3)
            for result in results:
                result.score = result.score * 0.8  # Lower weight
                all_vector_results.append(result)
        
        # 3. Deduplicate and re-rank
        seen_ids = set()
        unique_results = []
        for result in all_vector_results:
            if result.id not in seen_ids:
                seen_ids.add(result.id)
                unique_results.append(result)
        
        vector_results = sorted(unique_results, 
                              key=lambda x: x.score, 
                              reverse=True)[:top_k]
        
        # Debug
        print(f"\n📊 Retrieved {len(vector_results)} unique chunks:")
        for i, r in enumerate(vector_results[:3], 1):
            section = r.metadata.get('full_section', 'Unknown')
            score = r.score
            print(f"  {i}. {section[:60]}... (score: {score:.3f})")
        
        # 4. Extract Neo4j IDs
        neo4j_ids = []
        for result in vector_results:
            if hasattr(result, 'metadata'):
                meta = result.metadata
                for field in ['section_id', 'parent_id', 'neo4j_id']:
                    if field in meta and meta[field] and meta[field] != "ROOT":
                        neo4j_ids.append(meta[field])
                        break
        
        # 5. Get graph context
        graph_context = {}
        if neo4j_ids:
            try:
                unique_ids = list(set(neo4j_ids))[:6]  # Up from 5
                graph_context = self.neo4j_client.get_related_context(unique_ids)
                print(f"📚 Retrieved {len(graph_context.get('context', []))} graph nodes")
            except Exception as e:
                print(f"⚠️ Neo4j query error: {e}")
                graph_context = {'context': []}
        
        # 6. Build clean context
        combined_context = self._build_context(query, vector_results, graph_context)
        
        return RetrievedContext(
            vector_results=vector_results,
            graph_context=graph_context,
            combined_context=combined_context,
            expanded_queries=expanded_queries
        )
    
    def _build_context(self, original_query: str, 
                       vector_results: List[Dict], 
                       graph_context: Dict) -> str:
        """
        Build clean course material context for the LLM.
        
        No formatting instructions here — those are in the system prompt.
        This just presents the material clearly so the LLM can synthesize.
        """
        
        context = ""
        
        # Group results by section
        sections_map = {}
        for result in vector_results:
            meta = result.metadata
            full_section = meta.get('full_section', 'Unknown Section')
            
            if full_section not in sections_map:
                sections_map[full_section] = {
                    'chunks': [],
                    'max_score': 0
                }
            
            sections_map[full_section]['chunks'].append({
                'content': meta.get('text', ''),
                'score': result.score,
                'page': meta.get('page', 'N/A')
            })
            sections_map[full_section]['max_score'] = max(
                sections_map[full_section]['max_score'], 
                result.score
            )
        
        # Sort by relevance
        sorted_sections = sorted(
            sections_map.items(), 
            key=lambda x: x[1]['max_score'], 
            reverse=True
        )
        
        # Present as clean course material — up to 7 sections, 4 chunks each
        for i, (section_path, data) in enumerate(sorted_sections[:7], 1):
            context += f"[{section_path}]\n"
            
            for chunk in data['chunks'][:4]:
                content = chunk['content'].strip()
                if content:
                    context += f"{content}\n\n"
        
        # Add graph context
        if graph_context and 'context' in graph_context and graph_context['context']:
            context += "\n[Related Course Material]\n"
            
            graph_sections = {}
            for item in graph_context['context']:
                section = item.get('section_title', 'Unknown')
                if section not in graph_sections:
                    graph_sections[section] = []
                graph_sections[section].append(item)
            
            for section, items in list(graph_sections.items())[:4]:  # Up from 3
                context += f"\n[{section}]\n"
                for item in items[:3]:  # Up from 2
                    if item.get('content'):
                        context += f"{item['content'].strip()}\n\n"
        
        return context.strip()

# Backwards compatibility
HybridRetriever = EnhancedHybridRetriever
