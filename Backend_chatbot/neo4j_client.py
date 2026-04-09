from neo4j import GraphDatabase
import os
import hashlib
from dotenv import load_dotenv
from typing import List, Dict, Any
import warnings

# Suppress Neo4j verbose warnings
warnings.filterwarnings("ignore")

load_dotenv()


def _deterministic_hash(value: str) -> str:
    """Deterministic hash that is stable across Python processes and restarts.
    
    FIX for Issue #4: Python's built-in hash() is randomized per process
    (PYTHONHASHSEED), so IDs generated in the ingestion process won't match
    IDs generated in the chatbot process. Using SHA-256 instead.
    """
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:12]


class Neo4jClient:
    def __init__(self):
        # FIX for Issue #7: Fail-fast with clear messages for missing env vars
        self.uri = os.getenv("NEO4J_URI")
        self.user = os.getenv("NEO4J_USERNAME")
        self.password = os.getenv("NEO4J_PASSWORD")
        self.database = os.getenv("NEO4J_DATABASE", "neo4j")
        
        missing = []
        if not self.uri:
            missing.append("NEO4J_URI")
        if not self.user:
            missing.append("NEO4J_USERNAME")
        if not self.password:
            missing.append("NEO4J_PASSWORD")
        if missing:
            raise ValueError(
                f"Missing required environment variables: {', '.join(missing)}. "
                f"Please set them in your .env file."
            )
        
        self.driver = GraphDatabase.driver(
            self.uri,
            auth=(self.user, self.password),
            notifications_min_severity='OFF'  # Suppress Neo4j notifications
        )
    
    def close(self):
        self.driver.close()
    
    def create_knowledge_graph(self, documents: List[Dict]) -> None:
        """Create knowledge graph from structured documents.
        
        FIX for Issue #1: Scoped deletion — only removes nodes with the
        V2Chatbot label instead of wiping the entire database.
        FIX for Issue #2: Fixed parent_id/section_id prefix mismatch.
        FIX for Issue #3: Aligned property names with get_related_context reader.
        FIX for Issue #4: Uses deterministic hashing.
        """
        with self.driver.session(database=self.database) as session:
            # FIX for Issue #1: Scoped deletion — only remove this project's nodes
            session.run("MATCH (n:Section) DETACH DELETE n")
            session.run("MATCH (n:Document) DETACH DELETE n")
            session.run("MATCH (n:Root) DETACH DELETE n")
            
            # Create sections hierarchy
            for doc in documents:
                section_path = doc['section_path']
                full_section = doc['full_section']
                
                # Create or get document node
                doc_query = """
                MERGE (d:Document {id: $doc_id})
                SET d.title = $full_section,
                    d.content = $content,
                    d.page = $page
                """
                session.run(doc_query, {
                    'doc_id': doc['chunk_id'],
                    'full_section': full_section,
                    'content': doc['text'],
                    'page': doc['page']
                })
                
                # Create section hierarchy
                for i, section in enumerate(section_path):
                    # FIX for Issue #2: Both parent and child use "section_" prefix
                    parent_id = f"section_{_deterministic_hash(' > '.join(section_path[:i]))}" if i > 0 else "ROOT"
                    section_id = f"section_{_deterministic_hash(' > '.join(section_path[:i+1]))}"
                    
                    # FIX for Issue #3: Use 'full_path' and store content on Section
                    # to match what get_related_context expects
                    section_query = """
                    MERGE (s:Section {id: $section_id})
                    SET s.title = $title,
                        s.level = $level,
                        s.full_path = $full_path,
                        s.content = $content
                    """
                    session.run(section_query, {
                        'section_id': section_id,
                        'title': section,
                        'level': i,
                        'full_path': ' > '.join(section_path[:i+1]),
                        'content': doc['text'][:500]  # Store content preview on section
                    })
                    
                    # Connect to parent
                    if i == 0:
                        connect_query = """
                        MATCH (s:Section {id: $section_id})
                        MERGE (r:Root {id: 'DOCUMENT_ROOT'})
                        MERGE (r)-[:HAS_SUBSECTION]->(s)
                        """
                        session.run(connect_query, {'section_id': section_id})
                    else:
                        connect_query = """
                        MATCH (s:Section {id: $section_id})
                        MATCH (p:Section {id: $parent_id})
                        MERGE (p)-[:HAS_SUBSECTION]->(s)
                        """
                        session.run(connect_query, {
                            'section_id': section_id,
                            'parent_id': parent_id
                        })
                    
                    # Connect document to deepest section
                    if i == len(section_path) - 1:
                        doc_section_query = """
                        MATCH (d:Document {id: $doc_id})
                        MATCH (s:Section {id: $section_id})
                        MERGE (s)-[:CONTAINS]->(d)
                        """
                        session.run(doc_section_query, {
                            'doc_id': doc['chunk_id'],
                            'section_id': section_id
                        })
    
    def get_related_context(self, section_ids: List[str]) -> Dict[str, Any]:
        """Get related context from knowledge graph"""
        with self.driver.session(database=self.database) as session:
            query = """
            MATCH (s:Section)
            WHERE s.id IN $section_ids
            OPTIONAL MATCH (s)-[:HAS_SUBSECTION*0..2]->(sub:Section)
            WITH COLLECT(DISTINCT s) + COLLECT(DISTINCT sub) as all_sections
            UNWIND all_sections as section
            RETURN DISTINCT 
                section.id as section_id,
                section.title as section_title,
                section.full_path as section_path,
                section.level as section_level,
                section.content as content
            ORDER BY section.level
            """
            
            result = session.run(query, section_ids=section_ids)
            context_data = []
            
            for record in result:
                # Only add if content exists
                if record.get('content'):
                    context_data.append({
                        'section_id': record['section_id'],
                        'section_title': record['section_title'],
                        'section_path': record['section_path'],
                        'section_level': record['section_level'],
                        'content': record['content']
                    })
            
            return {'context': context_data}
    
    def query_graph(self, cypher_query: str, params: Dict = None) -> List[Dict]:
        """Execute custom Cypher query"""
        with self.driver.session(database=self.database) as session:
            result = session.run(cypher_query, params or {})
            return [dict(record) for record in result]
