"""
test_pdf_processing.py — Test script for PDF & Word processing pipeline.
"""

import os, sys, time

print("\n" + "="*60)
print("🧪 PDF & WORD PROCESSING TEST")
print("="*60)

# ── Test 1: Import check ──────────────────────────────────────
print("\n📦 Test 1: Importing modules...")
try:
    from pdf_preprocessor import extract_and_clean_pdf
    print("   ✅ pdf_preprocessor imported OK")
except ImportError as e:
    print(f"   ❌ FAILED: {e}"); sys.exit(1)

try:
    from txt_processor import TXTStructureParser
    print("   ✅ txt_processor imported OK")
except ImportError as e:
    print(f"   ❌ FAILED: {e}"); sys.exit(1)

# ── Test 2: Check PDFs ───────────────────────────────────────
print("\n📁 Test 2: Checking pdfs/ folder...")
pdfs = [f for f in os.listdir("pdfs") if f.endswith((".pdf", ".docx"))]
print(f"   ✅ Found {len(pdfs)} file(s):")
for f in pdfs:
    size = os.path.getsize(f"pdfs/{f}")
    print(f"      - {f} ({size/1024:.1f} KB)")

# ── Test 3: PDF extraction ────────────────────────────────────
print(f"\n📄 Test 3: Extracting text from '{pdfs[0]}' using IBM Docling...")
start = time.time()
try:
    text = extract_and_clean_pdf(f"pdfs/{pdfs[0]}")
    elapsed = time.time() - start
    print(f"   ✅ Extraction done in {elapsed:.2f}s")
    print(f"   📊 {len(text.split()):,} words / {len(text):,} characters extracted")
    print(f"\n   📝 Preview (first 300 chars):")
    print("   " + "-"*50)
    print("   " + text[:300].replace("\n", "\n   "))
    print("   " + "-"*50)
except Exception as e:
    print(f"   ❌ FAILED: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)

# ── Test 4: Chunking ─────────────────────────────────────────
print(f"\n🔍 Test 4: Parsing & chunking extracted text...")
try:
    parser = TXTStructureParser()
    os.makedirs("data/txts", exist_ok=True)
    tmp = "data/txts/_test_temp.txt"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    sections = parser.parse_txt_file(tmp)
    chunks = parser.create_chunks(sections, chunk_size=200, overlap=40)
    os.remove(tmp)
    print(f"   ✅ {len(sections)} sections parsed")
    print(f"   ✅ {len(chunks)} chunks created")
    if sections:
        print(f"   📑 First section: '{sections[0].title[:80]}'")
except Exception as e:
    print(f"   ❌ FAILED: {e}")
    import traceback; traceback.print_exc()

# ── Test 5: DOCX ─────────────────────────────────────────────
print(f"\n📝 Test 5: DOCX (Word) support check...")
docx = [f for f in pdfs if f.endswith(".docx")]
if docx:
    try:
        t = extract_and_clean_pdf(f"pdfs/{docx[0]}")
        print(f"   ✅ DOCX worked — {len(t.split())} words")
    except Exception as e:
        print(f"   ❌ FAILED: {e}")
else:
    print("   ℹ️  No .docx in pdfs/ — place one there to test Word processing")

print("\n" + "="*60)
print("✅ PDF & Word processing tests complete!")
print("="*60 + "\n")
