"""
Validation script to check if PDF preprocessing preserved structure correctly.
Run this AFTER preprocessing to verify output quality.
"""

import os
import re
from glob import glob

OUTPUT_DIR = "data/txts"


def analyze_txt_structure(txt_path):
    """Analyze a single TXT file for structure quality."""
    with open(txt_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    
    stats = {
        'filename': os.path.basename(txt_path),
        'total_lines': len(lines),
        'total_chars': len(content),
        'chapters': [],
        'units': [],
        'numbered_sections': [],
        'subsections': [],
        'headings': [],
        'tables': [],
        'bullets': 0,
        'paragraphs': 0
    }
    
    # Patterns for structure detection
    chapter_pattern = re.compile(r'^(Chapter|CHAPTER|CH\.?)\s+(\d+|[IVXLCDM]+)', re.IGNORECASE)
    unit_pattern = re.compile(r'^(Unit|UNIT)\s+\d+', re.IGNORECASE)
    section_pattern = re.compile(r'^(\d+(?:\.\d+)+)\s+(.+)$')
    subsection_pattern = re.compile(r'^[A-Z]\.\s+(.+)$')
    table_pattern = re.compile(r'^Table:', re.IGNORECASE)
    bullet_pattern = re.compile(r'^-\s+')
    
    for line in lines:
        stripped = line.strip()
        
        if not stripped:
            continue
        
        # Check for structure elements
        if chapter_pattern.match(stripped):
            stats['chapters'].append(stripped[:60])
        elif unit_pattern.match(stripped):
            stats['units'].append(stripped[:60])
        elif section_pattern.match(stripped):
            stats['numbered_sections'].append(stripped[:60])
        elif subsection_pattern.match(stripped):
            stats['subsections'].append(stripped[:60])
        elif table_pattern.match(stripped):
            stats['tables'].append(stripped[:60])
        elif bullet_pattern.match(stripped):
            stats['bullets'] += 1
        elif stripped.isupper() and len(stripped) > 3 and len(stripped) < 80:
            stats['headings'].append(stripped[:60])
        elif len(stripped) > 50 and not any([
            chapter_pattern.match(stripped),
            unit_pattern.match(stripped),
            section_pattern.match(stripped),
            bullet_pattern.match(stripped)
        ]):
            stats['paragraphs'] += 1
    
    return stats


def print_file_analysis(stats):
    """Print analysis for a single file."""
    separator = "=" * 70
    print(f"\n{separator}")
    print(f"📄 File: {stats['filename']}")
    print(f"{separator}")
    print(f"Total lines: {stats['total_lines']:,}")
    print(f"Total characters: {stats['total_chars']:,}")
    
    print(f"\n📚 STRUCTURE ELEMENTS:")
    print(f"   Chapters: {len(stats['chapters'])}")
    if stats['chapters']:
        for i, ch in enumerate(stats['chapters'][:3], 1):
            print(f"      {i}. {ch}")
        if len(stats['chapters']) > 3:
            print(f"      ... and {len(stats['chapters']) - 3} more")
    
    print(f"\n   Units: {len(stats['units'])}")
    if stats['units']:
        for i, u in enumerate(stats['units'][:3], 1):
            print(f"      {i}. {u}")
    
    print(f"\n   Numbered Sections (e.g., 1.2.3): {len(stats['numbered_sections'])}")
    if stats['numbered_sections']:
        for i, s in enumerate(stats['numbered_sections'][:5], 1):
            print(f"      {i}. {s}")
        if len(stats['numbered_sections']) > 5:
            print(f"      ... and {len(stats['numbered_sections']) - 5} more")
    
    print(f"\n   Subsections (A., B., etc.): {len(stats['subsections'])}")
    if stats['subsections']:
        for i, s in enumerate(stats['subsections'][:3], 1):
            print(f"      {i}. {s}")
    
    print(f"\n   ALL CAPS Headings: {len(stats['headings'])}")
    if stats['headings']:
        for i, h in enumerate(stats['headings'][:3], 1):
            print(f"      {i}. {h}")
    
    print(f"\n   Tables: {len(stats['tables'])}")
    print(f"   Bullet points: {stats['bullets']}")
    print(f"   Paragraphs: {stats['paragraphs']}")


def check_structure_quality(stats):
    """Check if structure is good enough for RAG."""
    issues = []
    warnings = []
    
    total_structure = (len(stats['chapters']) + len(stats['units']) + 
                      len(stats['numbered_sections']) + len(stats['subsections']))
    
    # CRITICAL ISSUES
    if total_structure == 0:
        issues.append("❌ CRITICAL: No hierarchical structure detected!")
        issues.append("   → No Chapters, Units, or numbered sections found")
        issues.append("   → Your RAG pipeline will NOT work correctly")
        issues.append("   → All chunks will be labeled as 'Introduction'")
    
    if len(stats['chapters']) == 0 and len(stats['units']) == 0:
        warnings.append("⚠️  No top-level structure (Chapters/Units) found")
        warnings.append("   → Document might not have clear chapter divisions")
    
    # QUALITY CHECKS
    if stats['paragraphs'] == 0:
        warnings.append("⚠️  No paragraphs detected - content might be too fragmented")
    
    if stats['bullets'] > stats['paragraphs'] * 3:
        warnings.append("⚠️  Very high bullet-to-paragraph ratio")
        warnings.append("   → Document might be mostly lists")
    
    # GOOD SIGNS
    good_signs = []
    if total_structure > 10:
        good_signs.append("✅ Good hierarchical structure detected")
    if len(stats['chapters']) + len(stats['units']) > 0:
        good_signs.append("✅ Top-level divisions (Chapters/Units) found")
    if len(stats['numbered_sections']) > 5:
        good_signs.append("✅ Multiple nested sections found")
    if stats['paragraphs'] > 20:
        good_signs.append("✅ Substantial content paragraphs found")
    
    return issues, warnings, good_signs


def validate_all_files():
    """Validate all preprocessed TXT files."""
    txt_files = sorted(glob(os.path.join(OUTPUT_DIR, "*.txt")))
    
    if not txt_files:
        print(f"❌ No TXT files found in {OUTPUT_DIR}")
        print(f"   Run the preprocessing script first!")
        return
    
    separator = "=" * 70
    
    print(f"{separator}")
    print(f"🔍 VALIDATING PREPROCESSED FILES")
    print(f"{separator}")
    print(f"Found {len(txt_files)} files to validate\n")
    
    all_stats = []
    
    for txt_path in txt_files:
        stats = analyze_txt_structure(txt_path)
        all_stats.append(stats)
        print_file_analysis(stats)
        
        # Check quality
        issues, warnings, good_signs = check_structure_quality(stats)
        
        if good_signs:
            print(f"\n✅ QUALITY CHECKS:")
            for sign in good_signs:
                print(f"   {sign}")
        
        if warnings:
            print(f"\n⚠️  WARNINGS:")
            for warning in warnings:
                print(f"   {warning}")
        
        if issues:
            print(f"\n❌ CRITICAL ISSUES:")
            for issue in issues:
                print(f"   {issue}")
    
    # Summary
    print(f"\n\n{separator}")
    print(f"📊 OVERALL SUMMARY")
    print(f"{separator}")
    
    total_chapters = sum(len(s['chapters']) for s in all_stats)
    total_units = sum(len(s['units']) for s in all_stats)
    total_sections = sum(len(s['numbered_sections']) for s in all_stats)
    total_subsections = sum(len(s['subsections']) for s in all_stats)
    
    print(f"\nAcross all {len(all_stats)} files:")
    print(f"   Total Chapters: {total_chapters}")
    print(f"   Total Units: {total_units}")
    print(f"   Total Numbered Sections: {total_sections}")
    print(f"   Total Subsections: {total_subsections}")
    print(f"   Total Structure Elements: {total_chapters + total_units + total_sections + total_subsections}")
    
    # Final verdict
    total_structure = total_chapters + total_units + total_sections + total_subsections
    
    # FIX for Issue #10: These were printing literal "{'='*70}" instead of separator lines
    print(f"\n{separator}")
    if total_structure == 0:
        print("❌ VERDICT: PREPROCESSING FAILED")
        print(separator)
        print("\nYour files have NO hierarchical structure.")
        print("This means:")
        print("  • All content will be labeled as 'Introduction'")
        print("  • RAG retrieval will be poor")
        print("  • Chatbot will give generic answers")
        print("\n📋 NEXT STEPS:")
        print("  1. Check your PDF files - do they have clear chapters/sections?")
        print("  2. Review the heading detection patterns in pdf_preprocessor.py")
        print("  3. You may need to manually add structure markers")
    elif total_structure < 20:
        print("⚠️  VERDICT: WEAK STRUCTURE")
        print(separator)
        print("\nStructure detected but limited.")
        print("This might work but quality will be reduced.")
        print("\n📋 RECOMMENDATION:")
        print("  • Review output files for missed headings")
        print("  • Consider improving heading detection patterns")
    else:
        print("✅ VERDICT: GOOD STRUCTURE DETECTED")
        print(separator)
        print("\nYour files have good hierarchical structure!")
        print("This should work well with the RAG pipeline.")
        print("\n📋 NEXT STEPS:")
        print("  1. Review the output files to verify accuracy")
        print("  2. Run: python process_txt_pipeline.py")
        print("  3. Then run: python main.py to test the chatbot")
    print(f"{separator}\n")


if __name__ == "__main__":
    validate_all_files()
