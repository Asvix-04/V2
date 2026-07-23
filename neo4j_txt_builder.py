from neo4j import GraphDatabase
from typing import List
import os
from txt_processor import DocumentSection

BATCH_SIZE = 500

class TXTNeo4jBuilder:
    def __init__(self, uri, user, password):
        if not uri:
            raise ValueError("Neo4j URI is required. Check your NEO4J_URI env var.")
        if not user or not password:
            raise ValueError("Neo4j credentials are required. Check NEO4J_USERNAME and NEO4J_PASSWORD env vars.")

        self.driver = GraphDatabase.driver(uri, auth=(user, password))
        self.database = os.getenv("NEO4J_DATABASE", "neo4j")

    def close(self):
        self.driver.close()

    def _run_batch(self, query, batch):
        with self.driver.session(database=self.database) as session:
            session.run(query, {"batch": batch})

    def build_graph_from_sections(self, sections: List[DocumentSection]):
        # Clear existing nodes
        with self.driver.session(database=self.database) as session:
            session.run("MATCH (n:Section) DETACH DELETE n")

        print(f"Building graph from {len(sections)} sections...")

        # ── Batch insert nodes ──────────────────────────────────
        node_batch = []
        total = len(sections)
        for i, section in enumerate(sections):
            node_batch.append({
                "id":        section.id,
                "title":     section.title[:200],
                "content":   section.content[:1000],
                "level":     section.level,
                "full_path": " > ".join(section.section_path),
                "type": (
                    "chapter" if section.level == 1
                    else "section" if section.level <= 3
                    else "content"
                ),
            })
            if len(node_batch) >= BATCH_SIZE:
                self._run_batch(
                    """
                    UNWIND $batch AS row
                    MERGE (s:Section {id: row.id})
                    SET s.title     = row.title,
                        s.content   = row.content,
                        s.level     = row.level,
                        s.full_path = row.full_path,
                        s.type      = row.type
                    """,
                    node_batch,
                )
                print(f"  Nodes: {min(i+1, total)}/{total}")
                node_batch = []

        if node_batch:
            self._run_batch(
                """
                UNWIND $batch AS row
                MERGE (s:Section {id: row.id})
                SET s.title     = row.title,
                    s.content   = row.content,
                    s.level     = row.level,
                    s.full_path = row.full_path,
                    s.type      = row.type
                """,
                node_batch,
            )
            print(f"  Nodes: {total}/{total}")

        # ── Batch insert relationships ──────────────────────────
        rel_batch = []
        rel_count = 0
        for section in sections:
            if section.parent_id:
                rel_batch.append({"parent_id": section.parent_id, "child_id": section.id})
                if len(rel_batch) >= BATCH_SIZE:
                    self._run_batch(
                        """
                        UNWIND $batch AS row
                        MATCH (parent:Section {id: row.parent_id})
                        MATCH (child:Section  {id: row.child_id})
                        MERGE (parent)-[:HAS_SUBSECTION]->(child)
                        """,
                        rel_batch,
                    )
                    rel_count += len(rel_batch)
                    rel_batch = []

        if rel_batch:
            self._run_batch(
                """
                UNWIND $batch AS row
                MATCH (parent:Section {id: row.parent_id})
                MATCH (child:Section  {id: row.child_id})
                MERGE (parent)-[:HAS_SUBSECTION]->(child)
                """,
                rel_batch,
            )
            rel_count += len(rel_batch)

        print(f"Created {rel_count} hierarchical relationships")

    def _create_content_relationships(self, session, sections):
        """Skipped — O(n²) keyword matching across 16k sections is too slow."""
        pass
