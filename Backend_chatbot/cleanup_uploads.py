# import os
# import time
# import re
# from pinecone_client import PineconeClient
# from dotenv import load_dotenv

# # Load environment variables (e.g., PINECONE_API_KEY)
# load_dotenv()

# # Configuration
# HOURS_TO_KEEP = 48
# UPLOAD_DIR = "pdfs"
# TXT_DIR = os.path.join("data", "txts")
# PINECONE_INDEX_NAME = "pdf-knowledge-base"
# NAMESPACE = "uploads"

# def main():
#     print(f" Starting Cleanup Task: Deleting uploads older than {HOURS_TO_KEEP} hours...")
    
#     if not os.path.isdir(UPLOAD_DIR):
#         print(f"Directory '{UPLOAD_DIR}' not found. Exiting.")
#         return

#     # Initialize Pinecone Client
#     try:
#         pc = PineconeClient(PINECONE_INDEX_NAME)
#     except Exception as e:
#         print(f" Failed to connect to Pinecone: {e}")
#         return

#     current_time = time.time()
#     cutoff_time = current_time - (HOURS_TO_KEEP * 3600)
    
#     deleted_count = 0
    
#     for filename in os.listdir(UPLOAD_DIR):
#         if not filename.lower().endswith(".pdf"):
#             continue
            
#         pdf_path = os.path.join(UPLOAD_DIR, filename)
        
#         try:
#             # Check file modification time
#             mtime = os.path.getmtime(pdf_path)
            
#             if mtime < cutoff_time:
#                 stem = os.path.splitext(filename)[0]
#                 print(f"\n Found old PDF: {filename} (older than 48 hours)")
                
#                 # 1. Delete Pinecone Vectors
#                 safe_stem = re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_") or "doc"
#                 id_prefix = f"up_{safe_stem}_chunk"
                
#                 print(f"   - Searching for vectors with prefix: {id_prefix}")
#                 try:
#                     # Collect all vector IDs to delete
#                     old_ids = []
#                     for page in pc.index.list(prefix=id_prefix, namespace=NAMESPACE):
#                         old_ids.extend(page)
                    
#                     if old_ids:
#                         # Pinecone delete max 1000 at a time
#                         for i in range(0, len(old_ids), 1000):
#                             pc.index.delete(ids=old_ids[i:i + 1000], namespace=NAMESPACE)
#                         print(f" Deleted {len(old_ids)} vectors from Pinecone.")
#                     else:
#                         print("    No vectors found in Pinecone for this prefix.")
#                 except Exception as e:
#                     print(f" Error deleting vectors from Pinecone: {e}")
                
#                 # 2. Delete the .txt file (extracted text cache)
#                 txt_path = os.path.join(TXT_DIR, f"{stem}.txt")
#                 if os.path.exists(txt_path):
#                     os.remove(txt_path)
#                     print(f" Deleted text cache: {txt_path}")
                
#                 # 3. Delete the original PDF file
#                 os.remove(pdf_path)
#                 print(f" Deleted original PDF: {pdf_path}")
                
#                 deleted_count += 1
                
#         except Exception as e:
#             print(f" Error processing file '{filename}': {e}")
            
#     print(f"\n Cleanup complete! Total old PDFs removed: {deleted_count}")

# if __name__ == "__main__":
#     main()
