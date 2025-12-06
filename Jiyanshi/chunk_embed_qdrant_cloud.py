# chunk_and_embed.py - QDRANT CLOUD VERSION
import os
import re
from typing import List, Dict, Any
import logging

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_qdrant import QdrantVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.schema import Document
from qdrant_client import QdrantClient
from dotenv import load_dotenv

# Load environment variables from .env (QDRANT_URL, QDRANT_API_KEY, etc.)
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TextChunker:
    def __init__(self, chunk_size: int = 800, chunk_overlap: int = 100):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=[
                "\n\nUnit ",      # Split at units first
                "\n\nBLOCK ",     # Then blocks
                "\n\nActivity ",  # Then activities
                "\n\nChapter ",   # Then chapters
                "\n\n",           # Then paragraphs
                "\n",             # Then lines
                ". ",             # Then sentences
                " ",              # Then words
                ""
            ],
            length_function=len,
        )

    def extract_metadata_from_chunk(self, chunk_text: str, source: str) -> Dict[str, Any]:
        """Extract structural metadata from chunk content"""
        metadata = {
            "source": source,
            "type": "educational_pdf"
        }

        patterns = [
            (r'Unit (\d+):', 'unit'),
            (r'BLOCK (\d+):', 'block'),
            (r'Activity[ -]*(\d+)', 'activity'),
            (r'Chapter (\d+):', 'chapter'),
            (r'Page (\d+)', 'page'),  # If page markers are preserved
        ]

        # Only look at the beginning of the chunk for markers
        preview = chunk_text[:200]
        for pattern, key in patterns:
            match = re.search(pattern, preview)
            if match:
                metadata[key] = match.group(1)

        # Heuristic: first line as heading if it's short and not ending with punctuation
        lines = chunk_text.strip().split('\n')
        if lines and len(lines[0]) < 100 and not lines[0].endswith(('.', '!', '?')):
            metadata['heading'] = lines[0]

        return metadata

    def chunk_text(self, text: str, source_path: str) -> List[Document]:
        """
        Split text into chunks with metadata.
        Returns: List of LangChain Documents
        """
        logger.info(f"Chunking text from {source_path}")

        source_name = os.path.basename(source_path)
        documents = self.splitter.create_documents([text])

        enhanced_documents: List[Document] = []
        for doc in documents:
            metadata = self.extract_metadata_from_chunk(doc.page_content, source_name)
            enhanced_doc = Document(
                page_content=doc.page_content,
                metadata=metadata
            )
            enhanced_documents.append(enhanced_doc)

        logger.info(f"Created {len(enhanced_documents)} chunks")
        return enhanced_documents


class VectorStoreManager:
    """Manages Qdrant vector database operations (Qdrant Cloud)"""

    def __init__(
        self,
        collection_name: str = "educational_content",
        embedding_model: str = "sentence-transformers/all-mpnet-base-v2",
    ):
        self.collection_name = collection_name
        self.embedding_model = embedding_model

        # Qdrant Cloud config from environment
        self.qdrant_url = os.getenv("QDRANT_URL")
        self.qdrant_api_key = os.getenv("QDRANT_API_KEY")

        if not self.qdrant_url or not self.qdrant_api_key:
            raise ValueError(
                "QDRANT_URL or QDRANT_API_KEY missing. Please set them in .env"
            )

        logger.info(f"Connecting to Qdrant Cloud at: {self.qdrant_url}")
        logger.info(f"Using collection: {self.collection_name}")
        logger.info(f"Loading embedding model: {embedding_model}")

        self.embeddings = HuggingFaceEmbeddings(
            model_name=embedding_model,
            model_kwargs={'device': 'cpu'},  # Use 'cuda' if you have GPU
            encode_kwargs={'normalize_embeddings': True}
        )

        # Qdrant Cloud client
        self.client = QdrantClient(
            url=self.qdrant_url,
            api_key=self.qdrant_api_key,
        )

    def create_collection(self, documents: List[Document]):
        """Create or update vector collection with documents on Qdrant Cloud"""
        logger.info(f"Creating vector store collection on Qdrant Cloud: {self.collection_name}")

        try:
            vector_store = QdrantVectorStore.from_documents(
                documents=documents,
                embedding=self.embeddings,
                url=self.qdrant_url,
                api_key=self.qdrant_api_key,
                collection_name=self.collection_name,
                force_recreate=True,   # overwrite existing collection if present
            )

            logger.info(f"Successfully created collection with {len(documents)} documents")
            return vector_store

        except Exception as e:
            logger.error(f"Error creating vector store: {e}")
            raise

    def get_collection_info(self):
        """Get information about the collection from Qdrant Cloud"""
        try:
            info = self.client.get_collection(collection_name=self.collection_name)
            return {
                "name": info.name,
                "vectors_count": info.vectors_count,
                "status": info.status
            }
        except Exception as e:
            logger.error(f"Error getting collection info: {e}")
            return None


def process_cleaned_text(text_file_path: str, collection_name: str = "educational_content"):
    """
    Main pipeline: Load cleaned text → Chunk → Embed → Store (Qdrant Cloud)
    """
    logger.info(f"Starting processing for: {text_file_path}")

    try:
        with open(text_file_path, 'r', encoding='utf-8') as f:
            cleaned_text = f.read()
        logger.info(f"Loaded {len(cleaned_text)} characters from {text_file_path}")
    except Exception as e:
        logger.error(f"Error reading file {text_file_path}: {e}")
        return None

    # 1. Chunk text
    chunker = TextChunker(
        chunk_size=800,
        chunk_overlap=100
    )
    documents = chunker.chunk_text(cleaned_text, text_file_path)

    # 2. Create collection on Qdrant Cloud
    vector_manager = VectorStoreManager(
        collection_name=collection_name,
        embedding_model="sentence-transformers/all-mpnet-base-v2",
    )

    vector_store = vector_manager.create_collection(documents)

    # 3. Log collection info
    info = vector_manager.get_collection_info()
    if info:
        logger.info(f"Collection created on Qdrant Cloud: {info['name']} with {info['vectors_count']} vectors")

    return vector_store


def process_multiple_files(text_files: List[str], collection_name: str = "educational_content"):
    """
    Process multiple text files into a single collection on Qdrant Cloud
    """
    all_documents: List[Document] = []

    chunker = TextChunker(chunk_size=800, chunk_overlap=100)
    vector_manager = VectorStoreManager(
        collection_name=collection_name,
    )

    for file_path in text_files:
        logger.info(f"Processing: {file_path}")

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()

            documents = chunker.chunk_text(text, file_path)
            all_documents.extend(documents)

            logger.info(f"Added {len(documents)} chunks from {file_path}")

        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")
            continue

    if not all_documents:
        logger.error("No documents to process")
        return None

    logger.info(f"Creating vector store with {len(all_documents)} total chunks on Qdrant Cloud")
    vector_store = vector_manager.create_collection(all_documents)

    info = vector_manager.get_collection_info()
    if info:
        logger.info(f"Final collection on Qdrant Cloud: {info['name']} with {info['vectors_count']} vectors")

    return vector_store


def main_example():
    # Example: process a single cleaned text file and store in Qdrant Cloud
    vector_store = process_cleaned_text(
        text_file_path="processed/cleaned_book.txt",  # Your cleaned text file
        collection_name="mil_course"
    )

    if vector_store:
        # Test a search (reads from Qdrant Cloud)
        query = "What is Media and Information Literacy?"
        results = vector_store.similarity_search(query, k=3)

        print(f"\nResults for query: '{query}'")
        print("=" * 50)
        for i, result in enumerate(results):
            print(f"\nResult {i + 1}:")
            print(f"Content: {result.page_content[:200]}...")
            print(f"Metadata: {result.metadata}")
            print("-" * 30)

    return vector_store


if __name__ == "__main__":
    # Run example
    main_example()
