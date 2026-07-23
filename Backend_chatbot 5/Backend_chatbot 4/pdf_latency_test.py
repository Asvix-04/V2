"""
pdf_latency_test.py
====================
Fires all 100 questions from media_literacy_100Q.pdf (or .txt fallback)
against the running /chat endpoint and prints a detailed latency report.

Usage:
    python pdf_latency_test.py                  # all 100 questions
    python pdf_latency_test.py --limit 20       # first 20 only
    python pdf_latency_test.py --category Academic/Short
    python pdf_latency_test.py --concurrency 3  # parallel workers
"""

import re
import time
import json
import argparse
import statistics
import requests
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Config ────────────────────────────────────────────────────────────────────
BASE_URL   = "http://localhost:8000"
CHAT_URL   = f"{BASE_URL}/chat"
TXT_PATH   = Path("data/txts/media_literacy_100Q.txt")
TIMEOUT    = 120         # seconds per request
USE_HISTORY = False      # keep False for fair isolated latency per question

CATEGORIES = ["Greeting", "Academic/Short", "Academic/Long", "Follow-up", "Out of Scope"]

# ANSI colours
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

# ── Parse questions from .txt ─────────────────────────────────────────────────
def load_questions(txt_path: Path) -> list[dict]:
    """Returns list of {num, question, category}."""
    text = txt_path.read_text(encoding="utf-8")
    questions = []
    current_cat = "Unknown"

    pattern = r"(\[\s*[^\]]+\s*\])|(Q(\d+)\.\s+(.*?)(?=(?:Q\d+\.)|(?:\[)|$))"
    matches = re.findall(pattern, text, flags=re.DOTALL)
    
    for m in matches:
        if m[0]:
            current_cat = m[0].strip("[] ").strip()
        elif m[1]:
            num = int(m[2])
            q_text = m[3].strip()
            questions.append({
                "num": num,
                "question": q_text,
                "category": current_cat,
            })

    return questions


# Create a global session to maintain cookies
session = requests.Session()

# ── Single request ────────────────────────────────────────────────────────────
def fire_question(item: dict) -> dict:
    payload = {
        "question": item["question"], 
        "use_history": USE_HISTORY,
        "model": "4"  # Force use of Claude 3.5 Haiku
    }
    t0 = time.perf_counter()
    error = None
    status = None
    answer_len = 0
    answer_text = ""

    try:
        resp = session.post(CHAT_URL, json=payload, timeout=TIMEOUT)
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        status = resp.status_code
        if resp.ok:
            data = resp.json()
            answer_text = data.get("answer", "")
            answer_len = len(answer_text)
        else:
            error = resp.text[:120]
    except requests.exceptions.Timeout:
        latency_ms = TIMEOUT * 1000
        error = "TIMEOUT"
        status = 0
    except Exception as e:
        latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        error = str(e)[:120]
        status = 0

    return {
        **item,
        "latency_ms": latency_ms,
        "status": status,
        "answer_len": answer_len,
        "answer_text": answer_text,
        "error": error,
    }


# ── Report helpers ────────────────────────────────────────────────────────────
def latency_color(ms: float) -> str:
    if ms < 2000:
        return GREEN
    elif ms < 5000:
        return YELLOW
    return RED


def stats_block(values: list[float], label: str) -> str:
    if not values:
        return f"  {label}: no data\n"
    p50 = statistics.median(values)
    p95 = sorted(values)[int(len(values) * 0.95)]
    avg = statistics.mean(values)
    mn  = min(values)
    mx  = max(values)
    return (
        f"  {label}:\n"
        f"    avg={avg:>7.0f}ms  min={mn:>7.0f}ms  max={mx:>7.0f}ms\n"
        f"    p50={p50:>7.0f}ms  p95={p95:>7.0f}ms\n"
    )


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="PDF Latency Test for Digilab Chatbot")
    parser.add_argument("--limit",       type=int,   default=0,    help="Max questions to run (0=all)")
    parser.add_argument("--category",    type=str,   default="",   help="Filter by category name (partial match)")
    parser.add_argument("--concurrency", type=int,   default=1,    help="Parallel requests (default=1 sequential)")
    parser.add_argument("--output",      type=str,   default="",   help="Save JSON results to file")
    args = parser.parse_args()

    # ── Load ──
    if not TXT_PATH.exists():
        print(f"{RED}❌ Questions file not found: {TXT_PATH}{RESET}")
        return

    questions = load_questions(TXT_PATH)
    print(f"{BOLD}📄 Loaded {len(questions)} questions from {TXT_PATH}{RESET}")

    # ── Filter ──
    if args.category:
        questions = [q for q in questions if args.category.lower() in q["category"].lower()]
        print(f"🔍 Filtered to {len(questions)} questions matching '{args.category}'")

    if args.limit and args.limit < len(questions):
        questions = questions[:args.limit]
        print(f"✂️  Limited to first {len(questions)} questions")

    # ── Health check ──
    try:
        h = requests.get(f"{BASE_URL}/health", timeout=5)
        if h.ok:
            hdata = h.json()
            chatbot_ok = hdata.get("chatbot_ready", False)
            print(f"\n{'✅' if chatbot_ok else '⚠️ '} Server health: chatbot={chatbot_ok} "
                  f"speech={hdata.get('speech_ready')} db={hdata.get('db_connected')}")
        else:
            print(f"{RED}⚠️  Server health check failed ({h.status_code}){RESET}")
    except Exception as e:
        print(f"{RED}❌ Cannot reach server at {BASE_URL}: {e}{RESET}")
        return

    print(f"\n{BOLD}🚀 Starting latency test — {len(questions)} questions, "
          f"concurrency={args.concurrency}{RESET}")
    print(f"{'─'*72}")
    print(f"{'Q#':<5} {'Category':<16} {'Latency':>10}  {'Status':>6}  {'AnsLen':>7}  {'Error'}")
    print(f"{'─'*72}")

    results = []
    run_start = time.perf_counter()

    def run_and_print(item):
        r = fire_question(item)
        col = latency_color(r["latency_ms"])
        err_str = f"  ⚠ {r['error']}" if r["error"] else ""
        status_str = f"{r['status']}" if r["status"] else "ERR"
        print(f"Q{r['num']:<4} {r['category']:<16} "
              f"{col}{r['latency_ms']:>9.0f}ms{RESET}  "
              f"{status_str:>6}  {r['answer_len']:>7}c{err_str}")
        return r

    if args.concurrency == 1:
        for item in questions:
            results.append(run_and_print(item))
    else:
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            futures = {pool.submit(fire_question, item): item for item in questions}
            for future in as_completed(futures):
                r = future.result()
                results.append(r)
                col = latency_color(r["latency_ms"])
                err_str = f"  ⚠ {r['error']}" if r["error"] else ""
                status_str = f"{r['status']}" if r["status"] else "ERR"
                print(f"Q{r['num']:<4} {r['category']:<16} "
                      f"{col}{r['latency_ms']:>9.0f}ms{RESET}  "
                      f"{status_str:>6}  {r['answer_len']:>7}c{err_str}")

    total_wall = round((time.perf_counter() - run_start), 2)

    # ── Summary ──
    print(f"\n{'═'*72}")
    print(f"{BOLD}📊 LATENCY REPORT  —  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
    print(f"{'═'*72}")

    ok_results  = [r for r in results if not r["error"]]
    err_results = [r for r in results if r["error"]]
    all_lat     = [r["latency_ms"] for r in ok_results]

    print(f"\n  Total questions:  {len(results)}")
    print(f"  Succeeded:        {len(ok_results)}")
    print(f"  Failed/Timeout:   {len(err_results)}")
    print(f"  Wall-clock time:  {total_wall}s")

    if all_lat:
        print(f"\n{BOLD}  ── Overall ──{RESET}")
        print(stats_block(all_lat, "All questions"), end="")

    # Per-category breakdown
    print(f"\n{BOLD}  ── Per Category ──{RESET}")
    cats_seen = {}
    for r in ok_results:
        cats_seen.setdefault(r["category"], []).append(r["latency_ms"])

    for cat, lats in cats_seen.items():
        print(stats_block(lats, cat), end="")

    # Slowest 5
    if ok_results:
        slowest = sorted(ok_results, key=lambda x: x["latency_ms"], reverse=True)[:5]
        print(f"\n{BOLD}  ── Slowest 5 ──{RESET}")
        for r in slowest:
            print(f"  Q{r['num']:>3}  [{r['category']}]  {r['latency_ms']:.0f}ms  — {r['question'][:60]}")

    # Failures
    if err_results:
        print(f"\n{RED}{BOLD}  ── Failures ──{RESET}")
        for r in err_results:
            print(f"  Q{r['num']:>3}  [{r['category']}]  {r['error']}")

    # SLA buckets
    if all_lat:
        u2  = sum(1 for l in all_lat if l < 2000)
        u5  = sum(1 for l in all_lat if l < 5000)
        u10 = sum(1 for l in all_lat if l < 10000)
        n   = len(all_lat)
        print(f"\n{BOLD}  ── SLA Buckets ──{RESET}")
        print(f"  < 2s  : {u2}/{n}  ({100*u2//n}%)")
        print(f"  < 5s  : {u5}/{n}  ({100*u5//n}%)")
        print(f"  < 10s : {u10}/{n}  ({100*u10//n}%)")

    print(f"\n{'═'*72}\n")

    # ── Save JSON ──
    if args.output:
        out = {
            "run_at": datetime.now().isoformat(),
            "total": len(results),
            "ok": len(ok_results),
            "errors": len(err_results),
            "wall_seconds": total_wall,
            "results": results,
        }
        Path(args.output).write_text(json.dumps(out, indent=2))
        print(f"💾 Results saved to {args.output}")


if __name__ == "__main__":
    main()
