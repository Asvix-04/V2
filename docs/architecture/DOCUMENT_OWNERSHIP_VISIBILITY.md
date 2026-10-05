# Document Ownership & Visibility Contract
**DigiLab / IGNOU Production Architecture**
**Phase 5C-1 Architecture Contract & Audit**

---

## 1. Purpose

Before introducing document-level isolation, horizontal worker concurrency, and decoupled ingestion scaling into the DigiLab academic assistant, the system must establish an explicit, unambiguous **document ownership and visibility contract**.

In Phases 1 through 4A, the ingestion pipeline was optimized for single-stream throughput (reducing ingestion time from minutes to ~19 seconds). However, the Phase 5A concurrency stress test and Phase 5B architecture audit identified a fundamental multi-tenant boundary question:

> **When a student or teacher uploads a document, who is authorized to search, retrieve, and synthesize answers from that document?**

Without an explicit contract:
1. **Concurrency introduces data corruption:** Multiple users uploading documents with the same name (e.g., `syllabus.pdf` or `unit1.pdf`) silently overwrite each other's vector chunks, disk files, and lexical search indices.
2. **Retrieval introduces privacy breaches:** If uploaded documents are intended to be private to individual students or specific courses, the current shared retrieval pipeline exposes one user's uploads to all other users across the system.
3. **Decoupling and scaling cannot be safely engineered:** Designing worker concurrency (Phase 5C-7), stateless Python ingestion (Phase 5C-6), or decoupled BM25/vector partitioning (Phases 5C-4 & 5C-5) requires knowing whether data partitions are global, course-scoped, or user-scoped.

This document records the exact findings from an exhaustive, read-only architectural audit of the DigiLab codebase and formally establishes the contract requirements and unresolved product decisions.

---

## 2. Current System Behavior

The actual production codebase currently exhibits a **split-brain architecture** between the Node.js API gateway and the Python RAG / Vector / Lexical tier:

### 2.1 The Node.js Tier (Semi-Private Job Management)
- **Upload Route:** `POST /api/chat/upload` is protected by `protect` middleware (`authMiddleware.js`), extracting `req.user.id`.
- **Job Record:** Creates a `DocumentJob` record with `userId: req.user.id`, `documentId: doc_<timestamp>_<random>`, and `jobId: job_<timestamp>_<random>`.
- **Status & Retry Access Control:** `GET /api/chat/upload-status/:jobId` and `POST /api/chat/upload-retry/:jobId` explicitly enforce ownership:
  ```javascript
  if (job.userId && req.user && job.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this job' });
  }
  ```
- **Conclusion for Node Tier:** Ingestion tracking, upload jobs, and chat session histories are **strictly private** to the authenticated user.

### 2.2 The Python / Pinecone / BM25 Tier (100% Global Retrieval)
- **Identity Drop at Worker:** When BullMQ's worker (`crypt/backend/src/services/ingestionQueue.js`) dispatches the document to Python via `POST /upload-pdf`, **it drops `userId`, `documentId`, `jobId`, `courseId`, and all identity metadata**. It posts solely a multipart `file` blob and the original filename.
- **Python Ingestion:** Python (`Backend_chatbot/api_server.py`) accepts only `file: UploadFile`. It stores the file in a single global directory (`pdfs/{safe_name}`) and appends its extracted text into a shared global monolith (`data/txts/combined_book.txt`).
- **Pinecone Vectors:** Vector IDs are generated using only the filename stem (`up_{safe_stem}_chunk{n}`). Metadata contains only `source_file`, `section_path`, `full_section`, `text`, `neo4j_id`, and `type: "document_chunk"`. **There is no `user_id`, `document_id`, or `course_id` stored in vector metadata.**
- **BM25 Lexical Corpus:** Python re-chunks all files in `pdfs/` and merges them with the base course textbook into a single static JSON index (`data/bm25_corpus.json`).
- **Chatbot Retrieval:** When any user (or guest) queries the chatbot (`POST /chat`), the retrieval queries Pinecone namespaces `["", "uploads"]` with filter `{"type": "document_chunk"}` and queries the monolithic BM25 index. Furthermore, `PDFChatbot._load_uploaded_docs()` loads all files in `pdfs/` into memory and classifies them as globally "trusted content", bypassing strict domain validation for **all users**.
- **Conclusion for Retrieval Tier:** Any document uploaded by Student A is **immediately retrievable and answerable for Student B, Teacher C, or an unauthenticated Guest**.

---

## 3. Current Identity Flow

The table below traces the propagation (and loss) of identity attributes across every layer of the current implementation:

```
Client (React)
  │ [JWT Bearer Token + FormData(file)]
  ▼
Node Express Route (`POST /api/chat/upload`)
  │ Authenticates req.user.id via JWT
  ▼
DocumentJob (`DocumentJob.create(...)`)
  │ Persists jobId, documentId, userId to Redis/Firestore
  ▼
BullMQ Queue (`ingestionQueue.add(...)`)
  │ Enqueues job with { jobId, documentId, userId, filename, filePath }
  ▼
BullMQ Worker (`processIngestionJob` in `ingestionQueue.js`)
  │ ❌ DROPS userId, documentId, jobId!
  │ Calls POST http://localhost:8000/upload-pdf with ONLY FormData('file', blob)
  ▼
Python FastAPI (`POST /upload-pdf` in `api_server.py`)
  │ Accepts only UploadFile. Uses file.filename as sole identifier.
  ▼
Python Background Thread (`_run_pdf_ingestion`)
  │ Appends to global combined_book.txt
  │ Uses prefix: up_{safe_stem}_chunk
  ▼
Pinecone Index (`uploads` namespace)
  │ Upserts vectors with { source_file, type: 'document_chunk' }
  ▼
BM25 Monolithic Index (`data/bm25_corpus.json`)
  │ Appends chunks to global Okapi corpus
  ▼
Chatbot Retrieval (`/chat` -> `HybridRetriever.retrieve`)
  │ Queries Pinecone with filter {"type": "document_chunk"}
  │ Queries BM25 global corpus
  │ Fuses results via Reciprocal Rank Fusion (RRF)
```

### Identity Attribute Audit Matrix

| Pipeline Stage | `user_id` Available? | `document_id` Available? | `course_id` Available? | `tenant_id` Available? | `job_id` Available? | Ownership Persisted? | Ownership Propagated Downstream? |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Client Upload Request** | Yes (via JWT) | No (not yet created) | No | No | No | No | Yes (Bearer header) |
| **2. Node Route (`/upload`)** | Yes (`req.user.id`) | Yes (generated `doc_*`) | No | No | Yes (generated `job_*`) | Yes (`DocumentJob`) | Yes (to BullMQ) |
| **3. DocumentJob (DB)** | Yes | Yes | No | No | Yes | Yes (Redis + Firestore) | N/A (State store) |
| **4. BullMQ Job Payload** | Yes | Yes | No | No | Yes | Yes (in Redis queue) | **NO (Dropped in Worker)** |
| **5. Python `/upload-pdf`** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** |
| **6. Pinecone Vectors** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** |
| **7. BM25 Corpus Index** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** | **NO** |
| **8. Chatbot Query (`/chat`)** | Yes* (in Node bridge) | No | No | No | No | No | **NO (Dropped before RAG)** |

*\*Note on Chatbot Query:* In Node's `voiceController.js`, `user_id` is forwarded in the POST body to Python's `/chat` endpoint. However, in `api_server.py`, this `user_id` is passed **strictly and solely to `metrics_logger.py`** to record analytics. It is **never passed** into `chatbot.ask_question(...)`, `chatbot.ask_question_stream(...)`, or `retriever.retrieve(...)`.

---

## 4. Current Pinecone Ownership Model

### 4.1 Stored Metadata Fields
An inspection of `Backend_chatbot/pinecone_client.py` (lines 220–231) reveals the exact schema of every vector upserted into Pinecone:

```python
vectors.append({
    'id': chunk.chunk_id,      # e.g., "up_media_literacy_chunk0"
    'values': embedding,
    'metadata': {
        **chunk.metadata,       # contains 'source_file': f"{stem}.txt"
        'text': chunk.text[:1500],
        'neo4j_id': neo4j_id,
        'type': 'document_chunk',
    }
})
```

**Fields Present:**
- `id`: Formatted as `up_{safe_stem}_chunk{n}` (derived from sanitized filename).
- `text`: First 1,500 characters of chunk text.
- `source_file`: Original filename stem with `.txt` extension.
- `neo4j_id`: Deterministic hash of section path.
- `type`: Hardcoded string `"document_chunk"`.

**Fields Absent:**
- ❌ `user_id`
- ❌ `document_id`
- ❌ `course_id`
- ❌ `tenant_id`
- ❌ `visibility` / `access_control_list`
- ❌ `created_at` / `version`

### 4.2 Query Filters During Retrieval
An inspection of `Backend_chatbot/pinecone_client.py` (lines 251–257 and 312–318) and `hybrid_retriever.py` shows how Pinecone is queried:

```python
results = self.index.query(
    vector=query_embedding,
    top_k=top_k,
    include_metadata=True,
    namespace=ns,                     # iterates over ["", "uploads"]
    filter={"type": "document_chunk"} # ⚠️ ZERO ownership filtering
)
```

### 4.3 Isolation Assessment
1. **Does retrieval filter by user/course ownership?**
   **No.** The query filter matches all chunks with `type == "document_chunk"` in the `""` (bulk syllabus) and `"uploads"` namespaces.
2. **Can one user's uploaded document appear in another user's retrieval?**
   **Yes. 100% of uploaded documents are visible to all users.** Any user or guest asking a query related to an uploaded document will retrieve those chunks from Pinecone.
3. **Collision Risk:**
   Because vector IDs are keyed by sanitized filename (`up_{safe_stem}_chunk{n}`), if User A uploads `notes.pdf` and User B later uploads a different `notes.pdf`, **User B's ingestion deletes User A's vectors from Pinecone** (`pc.index.delete(ids=old_ids, namespace="uploads")`) and replaces them.
4. **Current vs. Intended:**
   - **Current Behavior:** Global shared document store with filename-keyed replacement.
   - **Intended Future Behavior:** Document-isolated vector indexing with explicit ownership/visibility metadata and pre-filtered vector queries.

---

## 5. Current BM25 Ownership Model

### 5.1 Monolithic Structure
An inspection of `Backend_chatbot/build_bm25_cache.py` (lines 60–101 and 173–194) reveals the BM25 indexing model:
- `_uploaded_stems()` scans the entire `pdfs/` directory.
- `_build_upload_chunks()` parses the text files for **all** uploaded files in `pdfs/`.
- Every chunk is assigned an ID `up_{safe}_bm25_{n}` and metadata:
  ```python
  {
      "source_file": f"{stem}.txt",
      "is_upload": True
  }
  ```
- `build_cache()` concatenates the 13,239 base syllabus chunks with **all** uploaded chunks into a single JSON array:
  ```python
  bm25_docs = list(base_docs)
  bm25_docs.extend(upload_chunks)
  _atomic_json_dump(bm25_docs, "data/bm25_corpus.json")
  ```

### 5.2 Retrieval Behavior
In `Backend_chatbot/hybrid_retriever.py`:
- `BM25Index` loads `data/bm25_corpus.json` into memory using `rank_bm25.BM25Okapi`.
- `BM25Index.search(query, top_k)` computes scores across all documents in `self.documents`.
- BM25 has **no post-filtering mechanism**, **no tenant partition**, **no user filter**, and **no course filter**.

### 5.3 Isolation Assessment
- BM25 is **globally searchable**.
- There is zero concept of user ownership, course ownership, document ID, or tenant isolation in BM25.
- Modifying `data/txts/combined_book.txt` and `data/bm25_corpus.json` modifies the shared index for every active and future conversation in that process.

---

## 6. Supported Visibility Models

Before Phase 5C implementation begins, the product architecture must formally evaluate the four canonical visibility models:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VISIBILITY MODELS                               │
├─────────────────┬──────────────────┬─────────────────┬─────────────────┤
│    A. PRIVATE   │ B. COURSE_SHARED │    C. GLOBAL    │    D. HYBRID    │
├─────────────────┼──────────────────┼─────────────────┼─────────────────┤
│ User A's docs   │ Docs scoped to   │ All uploads     │ Base syllabus is│
│ visible ONLY to │ Course/Space.    │ enter global    │ shared by all;  │
│ User A.         │ All course users │ knowledge base  │ user uploads are│
│ Zero sharing.   │ can query them.  │ for all users.  │ strictly private│
└─────────────────┴──────────────────┴─────────────────┴─────────────────┘
```

### Model A: PRIVATE
- **Definition:** Every uploaded document belongs strictly to the uploading `user_id`.
- **Retrieval Scope:**
  - Base IGNOU syllabus vectors (public/shared).
  - Uploaded vectors filtered strictly by `user_id == current_user.id`.
- **BM25 Impact:** BM25 cannot remain a single shared file. BM25 must either be dynamically partitioned per user, filtered post-search, or replaced with a vector/hybrid store supporting tenant filtering.
- **Pinecone Impact:** Metadata must contain `user_id`. Pinecone search queries must include filter `{"$and": [{"type": "document_chunk"}, {"user_id": current_user_id}]}` (or use per-user namespaces/metadata partitioning).
- **Use Case:** Personal academic assistant where students upload private assignments, dissertations, or study notes that other students must never see.

### Model B: COURSE_SHARED
- **Definition:** Every document is uploaded to a specific `course_id` (or `knowledge_space_id`).
- **Retrieval Scope:**
  - All users enrolled in or assigned to `course_id` (students and teachers) share the document corpus.
  - Users outside the course cannot retrieve those documents.
- **BM25 Impact:** BM25 cache must be partitioned per `course_id` (e.g., `data/bm25_cache_{course_id}.json`).
- **Pinecone Impact:** Metadata must contain `course_id`. Pinecone search queries must filter by `{"course_id": current_course_id}` or use per-course namespaces.
- **Use Case:** University / LMS classroom environment where an instructor uploads supplemental readings for "Course MCS-011" and all students in that course query it.

### Model C: GLOBAL (Current Implementation)
- **Definition:** Every uploaded document is considered a permanent or temporary expansion of the global DigiLab knowledge base.
- **Retrieval Scope:**
  - Any uploaded document is searchable by any authenticated user or guest.
- **BM25 Impact:** Monolithic corpus cache (as currently implemented) is technically compliant with this model, though concurrent updates still require atomic coordination.
- **Pinecone Impact:** Global namespace (as currently implemented).
- **Use Case:** Open academic reference library where every upload contributes to the universal digital library available to the entire campus community.

### Model D: HYBRID
- **Definition:** Dual-scope retrieval:
  1. System & course knowledge (IGNOU Media Literacy syllabus, official textbooks) is **GLOBAL** or **COURSE_SHARED**.
  2. User-uploaded materials (personal notes, draft papers) are **PRIVATE** by default, with an optional flag `is_public: boolean` or `shared_with_course: boolean`.
- **Retrieval Scope:**
  - `(scope == "global") OR (scope == "course" AND course_id == user.course_id) OR (scope == "private" AND user_id == user.id)`
- **BM25 Impact:** Base syllabus in global BM25; user uploads retrieved via vector search with metadata filter or personal BM25 index.
- **Pinecone Impact:** Pinecone supports this natively via composite metadata filtering:
  ```json
  {
    "$or": [
      {"scope": "global"},
      {"user_id": "user_123"}
    ]
  }
  ```
- **Use Case:** Modern enterprise/academic SaaS (Notion AI, Canvas LMS, Blackboard).

---

## 7. Unresolved Product Decision

> [!IMPORTANT]
> **DECISION REQUIRED FROM PRODUCT OWNER**
> The current codebase does NOT specify the business intent for document visibility.
> - The **Node backend** was written assuming **PRIVATE** jobs and user session isolation.
> - The **Python/RAG engine** was written assuming **GLOBAL** knowledge augmentation.
>
> We do NOT choose on behalf of the product owner. The product owner must explicitly choose between:
> 1. **Model A (Strictly Private User Documents)**
> 2. **Model B (Course/Classroom Shared Documents)**
> 3. **Model C (Universal Campus Knowledge Base)**
> 4. **Model D (Hybrid: Shared Syllabus + Private User Uploads)**

### Comparison Table for Product Decision

| Dimension | Model A (Private) | Model B (Course Shared) | Model C (Global) | Model D (Hybrid) |
| :--- | :--- | :--- | :--- | :--- |
| **Privacy Guarantee** | Complete (Zero cross-user leakage) | Scoped to Course | None (Universal exposure) | Complete for private; shared for course |
| **Cross-User Collisions** | Impossible (Namespaced/Filtered) | Impossible across courses | High (Filename collisions) | Impossible (Namespaced/Filtered) |
| **Pinecone Query Strategy** | Filter by `user_id` | Filter by `course_id` | No filter (Current) | Composite `$or` filter |
| **BM25 Architecture** | Must decouple from global file | Partition per course | Single monolithic file | Global base BM25 + Vector for private |
| **User Experience** | Personal study tutor | Classroom study group | Crowd-sourced campus library | Standard modern academic SaaS |
| **Required Schema Changes** | Add `userId` to Python & Pinecone | Add `courseId` to User, Job, & Vectors | None (Keep current) | Add `userId`, `courseId`, `visibility` |

---

## 8. Required Future Invariants

Regardless of which visibility model the product owner selects, any production implementation in Phase 5C must guarantee the following eight architectural invariants:

1. **Stable Document Identity:**
   Every document must have a globally unique, immutable `document_id` (e.g., UUIDv4 or `doc_<timestamp>_<entropy>`). Filenames must **never** be used as document identities.
2. **Explicit Ownership & Visibility Metadata:**
   Every vector chunk and search index entry must carry explicit ownership metadata:
   - `document_id`
   - `owner_id` (`user_id`)
   - `visibility` (`"private" | "course" | "global"`)
   - `course_id` (optional / required depending on model)
3. **Retrieval Visibility Enforcement:**
   Every retrieval mechanism (Pinecone vector search, BM25, graph traversal) must enforce visibility filtering at query time. No document outside the requesting user's visibility scope may be scored, returned, or fed into LLM synthesis.
4. **Vector ID Collision Prevention:**
   Vector IDs must be deterministically prefixed with the immutable `document_id`:
   `vec_{document_id}_chk_{chunk_index}`
   Two documents with the same filename (e.g., uploaded by different users or the same user twice) must generate completely disjoint vector IDs.
5. **Atomic, Targeted Document Deletion:**
   Deletion must target exactly one document by `document_id`:
   - Deleting document `X` removes all vectors prefixed with `vec_{document_id_X}_*`.
   - It must never delete vectors belonging to another document with the same filename.
   - It must remove document `X`'s chunks from lexical search without corrupting other documents.
6. **Re-upload Creates Independent Versions:**
   Uploading a file with the same filename creates an independently addressable document record and version, preserving previous versions or explicitly decommissioning the old version through a verified document-level lifecycle.
7. **Two-Phase Ingestion Finalization (No Premature Search):**
   A document must **never** become searchable before its ingestion is successfully finalized.
   - Vector upserts and lexical index updates must remain staged/uncommitted or tagged with `status: "staging"` until the entire pipeline (extraction, relevance check, chunking, embedding, indexing) succeeds.
   - If ingestion fails mid-way, staged vectors must be purged atomically, and `DocumentJob` must mark `FAILED`.
8. **Stateless Service Boundaries:**
   The Python ingestion service must not maintain in-memory singletons for upload tracking (such as the current global `_upload_status` dict). Upload job progress must be tracked in an external durable state store (Redis/Firestore) using `job_id`.

---

## 9. Phase 5C Dependency

This document establishes the foundation for the upcoming Phase 5C sub-phases. Implementation of subsequent sub-phases cannot proceed safely without explicit alignment on this contract:

```
┌────────────────────────────────────────────────────────┐
│  Phase 5C-1: Document Ownership & Visibility Contract   │  ◄ (Current Phase)
└──────────────────────────┬─────────────────────────────┘
                           │ Requires Product Model Decision
                           ▼
┌────────────────────────────────────────────────────────┐
│  Phase 5C-2: Document Identity & Isolation Design       │
│  - Propagate documentId & userId across all boundaries  │
│  - Namespace / metadata schema in Pinecone              │
└──────────────────────────┬─────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│  Phase 5C-3: Internal Sec    │   │  Phase 5C-4: Storage Decouple│
│  - Secure Node ↔ Python      │   │  - Object store / cloud disk │
│  - Shared secret / mTLS      │   │  - Eliminate shared 'pdfs/'  │
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │                                  │
               └─────────────────┬────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────┐
│  Phase 5C-5: BM25 Decoupling / Partitioning            │
│  - Multi-tenant / scoped lexical search                │
│  - Eliminate monolithic combined_book.txt mutations    │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  Phase 5C-6: Python Statelessness & Job Tracking       │
│  - Decouple in-memory _upload_status                   │
│  - Fully horizontal FastAPI workers                    │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│  Phase 5C-7: Worker Concurrency & BullMQ Scaling       │
│  - Increase concurrency > 1                            │
│  - Distributed locking per documentId                  │
└──────────────────────────┬─────────────────────────────┘
```

---
*Contract authored and audited under Phase 5C-1. No production code was modified during this audit.*
