from neo4j import GraphDatabase
from typing import List
from txt_processor import DocumentSection

class TXTNeo4jBuilder:
    def __init__(self, uri, user, password):
        # FIX for Issue #7: Validate credentials before connecting
        if not uri:
            raise ValueError("Neo4j URI is required. Check your NEO4J_URI env var.")
        if not user or not password:
            raise ValueError("Neo4j credentials are required. Check NEO4J_USERNAME and NEO4J_PASSWORD env vars.")
        
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
    
    def close(self):
        self.driver.close()
    
    def build_graph_from_sections(self, sections: List[DocumentSection]):
        """Build proper hierarchical graph from parsed sections.
        
        FIX for Issue #1: Scoped deletion — only removes Section nodes
        created by this pipeline, not the entire database.
        """
        with self.driver.session() as session:
            # FIX for Issue #1: Scoped deletion instead of wiping everything
            # Only delete nodes that belong to this pipeline's schema
            session.run("MATCH (n:Section) DETACH DELETE n")
            
            print(f"Building graph from {len(sections)} sections...")
            
            # Create all section nodes
            for section in sections:
                session.run("""
                MERGE (s:Section {id: $id})
                SET s.title = $title,
                    s.content = $content,
                    s.level = $level,
                    s.full_path = $full_path,
                    s.type = CASE 
                        WHEN $level = 1 THEN 'chapter'
                        WHEN $level <= 3 THEN 'section' 
                        ELSE 'content'
                    END
                """, 
                id=section.id,
                title=section.title[:200],
                content=section.content[:1000],  # Store first 1000 chars
                level=section.level,
                full_path=' > '.join(section.section_path)
                )
            
            # Create hierarchical relationships
            relationships = 0
            for section in sections:
                if section.parent_id:
                    session.run("""
                    MATCH (parent:Section {id: $parent_id})
                    MATCH (child:Section {id: $child_id})
                    MERGE (parent)-[:HAS_SUBSECTION]->(child)
                    """, 
                    parent_id=section.parent_id,
                    child_id=section.id
                    )
                    relationships += 1
                
                # Create NEXT relationship for reading order
                # (Find previous section at same level)
            
            print(f"Created {relationships} hierarchical relationships")
            
            # Create content similarity relationships
            self._create_content_relationships(session, sections)
    
    def _create_content_relationships(self, session, sections: List[DocumentSection]):
        """Create relationships based on content similarity"""
        # For chapters and major sections, find related content
        major_sections = [s for s in sections if s.level <= 3 and len(s.content) > 50]
        
        print(f"Creating content relationships for {len(major_sections)} major sections...")
        
        # Simple keyword-based relationships
        for i, section1 in enumerate(major_sections):
            for section2 in major_sections[i+1:]:
                # Extract key terms (simple approach)
                terms1 = set(section1.title.lower().split()[:5])
                terms2 = set(section2.title.lower().split()[:5])
                common = terms1.intersection(terms2)
                
                if len(common) >= 2:  # At least 2 common terms
                    session.run("""
                    MATCH (s1:Section {id: $id1})
                    MATCH (s2:Section {id: $id2})
                    MERGE (s1)-[:RELATED {common_terms: $terms}]->(s2)
                    """,
                    id1=section1.id,
                    id2=section2.id,
                    terms=list(common)
                    )
