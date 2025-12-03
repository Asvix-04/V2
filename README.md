# V2 — Academic RAG Chatbot for Media Literacy

### Built by **Asvix**

V2 is an AI-driven academic assistant designed to help **teachers** and **students** understand and teach **Media Literacy** more effectively.
Powered by a hybrid architecture—open-source LLMs, RAG pipelines, Neo4j knowledge graphs, and multimodal capabilities—V2 provides deeply contextual responses, pedagogically structured explanations, and exam-oriented learning tools.

---

## Vision

**To make Media Literacy education accessible, accurate, and easily teachable** through an AI-powered companion that supports lesson planning, conceptual understanding, and interactive learning.

---

## Key Features

### Dual User Modes

#### **1. Teacher Mode (Primary Focus)**

* Structured responses in curated sections:

  * *Methodology*
  * *Conceptual Understanding*
  * *Classroom Flow*
  * *Assessment Ideas*
* Uses the knowledge graph to surface prerequisite topics and related concepts.
* Designed to support lesson preparation and pedagogical clarity.

#### **2. Student Mode**

* Conversational QA experience.
* Clear, concise academic explanations.
* Multilingual output support.

---

## Core Architecture

V2 is built on a multi-layered academic retrieval system consisting of:

### **1. Open-Source LLM**

* Scalable, cost-effective, and less dependent on deprecated APIs.
* Candidates: LLaMA, Mistral, Qwen, etc.
* Served through an inference engine (vLLM/TGI).

### **2. Vector Database**

Used for semantic search across media-literacy-related documents.

* Option: Qdrant or Pinecone
* Stores embeddings with detailed metadata.

### **3. Knowledge Graph (Neo4j)**

Neo4j powers contextual understanding by structuring relationships between:

* Subjects
* Topics & Subtopics
* Media literacy concepts
* Resources
* Question banks
* Prerequisite relationships

This enhances teaching guidance and interconnected explanations.

### **4. Multi-source Dataset**

Composed of:

* PDF-based unstructured academic text
* SQL database containing structured academic content, question banks, and metadata

Both datasets are unified into a RAG-ready searchable format.

### **5. RAG Pipeline**

* Query → Embedding → Vector Search
* Expand context using Neo4j for concept relationships
* Incorporate SQL-derived structured insights
* Prompt templates vary based on Teacher/Student mode

---

## Premium Features (Planned)

### Preparation Mode (Exam-Focused)

* Study plans
* Topic progression
* Dynamic quiz generation
* Expanded academic dataset ingestion

### Image-Based Questions

* Support for diagrams, charts, textbook screenshots
* Visual question understanding

### Speech-to-Speech (Multilingual)

* Audio-based interaction
* ASR → RAG → TTS pipeline

---

## Project Roadmap

### **Phase 1 – Data Engineering**

* PDF ingestion, cleaning, chunking
* SQL → structured text conversion
* Initial embedding + vector DB population
* Neo4j schema + first KG build

### **Phase 2 – Backend (RAG + Dual Mode Behaviour)**

* Retrieval fusion: Vector DB + Neo4j + SQL
* Teacher Mode vs Student Mode response engine
* FastAPI backend endpoints

### **Phase 3 – Streamlit MVP**

* Role-based UI
* Interactive chat interface
* Teacher-optimized response formatting

### **Phase 4 – Premium Layer**

* Preparation mode
* Speech & image support
* User progress tracking

### **Phase 5 – Full Frontend Deployment**

* Custom React/Next.js frontend
* Supabase for auth, user roles, subscription logic
* Cloud-hosted backend infrastructure

### **Phase 6 – Iteration**

* Logging, evaluations
* KG refinement
* Dataset growth
* Performance tuning

---

## Contributing

We are working with the **Asvix** intern team.
Internal contributors should follow:

* Branch naming conventions
* PR-based review workflows
* Documentation updates with each new module

External contributions will be opened in future phases.
