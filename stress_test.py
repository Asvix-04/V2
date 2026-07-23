import asyncio
import httpx
import time
import statistics
import sys
from typing import List, Dict, Any

# Target URL for the API
BASE_URL = "http://localhost:8000"
CHAT_ENDPOINT = f"{BASE_URL}/chat"

# Sample questions on-topic to trigger full RAG and LLM generation paths
TEST_QUESTIONS = [
    "What is media literacy and why is it important?",
    "How has photography evolved historically?",
    "What is the difference between misinformation and disinformation?",
    "What is fake news and how does media literacy help identify it?",
    "Explain the agenda-setting theory in mass communication.",
    "What are the key elements of photographic composition?",
    "How does advertising influence social media communication?",
    "What are media ethics and why do they matter?",
    "What is photojournalism?",
    "Explain the role of gatekeeping in traditional news media."
]

async def send_chat_request(client: httpx.AsyncClient, request_id: int, question: str) -> Dict[str, Any]:
    payload = {
        "question": question,
        "model": None,
        "use_history": False,
        "user_id": f"stress_test_user_{request_id}"
    }
    
    start_time = time.perf_counter()
    status_code = 0
    error_message = None
    response_time = 0.0
    completed_successfully = False
    
    try:
        response = await client.post(CHAT_ENDPOINT, json=payload, timeout=60.0)
        status_code = response.status_code
        response_time = (time.perf_counter() - start_time) * 1000  # milliseconds
        if response.status_code == 200:
            completed_successfully = True
        else:
            error_message = f"HTTP {response.status_code}: {response.text[:200]}"
    except Exception as e:
        response_time = (time.perf_counter() - start_time) * 1000
        error_message = f"Exception: {type(e).__name__} - {str(e)}"
        
    return {
        "request_id": request_id,
        "question": question,
        "completed": completed_successfully,
        "status_code": status_code,
        "latency_ms": response_time,
        "error": error_message
    }

async def run_stress_test(concurrency: int, total_requests: int):
    print("=" * 60)
    print(f"STARTING STRESS TEST")
    print(f"Target Endpoint: {CHAT_ENDPOINT}")
    print(f"Concurrency Level: {concurrency} simultaneous workers")
    print(f"Total Requests: {total_requests}")
    print("=" * 60)
    
    # Pre-check health
    async with httpx.AsyncClient() as client:
        try:
            health = await client.get(f"{BASE_URL}/health")
            print(f"Health Check status: {health.status_code}")
            print(f"Health Response: {health.json()}")
        except Exception as e:
            print(f"Error: Cannot connect to server at {BASE_URL}. Is it running?")
            print(e)
            sys.exit(1)
            
    start_test = time.perf_counter()
    results = []
    
    # We will use a Semaphore to control the concurrency
    sem = asyncio.Semaphore(concurrency)
    
    async def worker(client: httpx.AsyncClient, request_id: int):
        async with sem:
            # Pick a question in a round-robin fashion
            question = TEST_QUESTIONS[request_id % len(TEST_QUESTIONS)]
            res = await send_chat_request(client, request_id, question)
            results.append(res)
            
            # Print a dot for progress
            if res["completed"]:
                sys.stdout.write(".")
            else:
                sys.stdout.write("F")
            sys.stdout.flush()

    # Configure Async client limits
    limits = httpx.Limits(max_keepalive_connections=concurrency, max_connections=concurrency * 2)
    async with httpx.AsyncClient(limits=limits) as client:
        tasks = [worker(client, i) for i in range(total_requests)]
        await asyncio.gather(*tasks)
        
    end_test = time.perf_counter()
    total_time = end_test - start_test
    
    print("\n" + "=" * 60)
    print("STRESS TEST RESULTS")
    print("=" * 60)
    
    successful_requests = [r for r in results if r["completed"]]
    failed_requests = [r for r in results if not r["completed"]]
    
    latencies = [r["latency_ms"] for r in results]
    success_latencies = [r["latency_ms"] for r in successful_requests]
    
    throughput = len(results) / total_time
    
    print(f"Total Test Duration: {total_time:.2f} seconds")
    print(f"Total Requests Sent: {len(results)}")
    print(f"Successful Requests: {len(successful_requests)} ({len(successful_requests)/len(results)*100:.1f}%)")
    print(f"Failed Requests:     {len(failed_requests)} ({len(failed_requests)/len(results)*100:.1f}%)")
    print(f"Throughput:          {throughput:.2f} requests/sec")
    
    if latencies:
        print("\nLatency Metrics (All Requests):")
        print(f"  Min Latency:     {min(latencies):.2f} ms")
        print(f"  Max Latency:     {max(latencies):.2f} ms")
        print(f"  Average Latency: {statistics.mean(latencies):.2f} ms")
        if len(latencies) > 1:
            print(f"  Std Deviation:   {statistics.stdev(latencies):.2f} ms")
            
        # Percentiles
        sorted_latencies = sorted(latencies)
        p50 = statistics.quantiles(sorted_latencies, n=100)[49] # 50th percentile (median)
        p90 = statistics.quantiles(sorted_latencies, n=10)[8]   # 90th percentile
        p95 = statistics.quantiles(sorted_latencies, n=20)[18]  # 95th percentile
        p99 = statistics.quantiles(sorted_latencies, n=100)[98] # 99th percentile
        print(f"  p50 (Median):    {p50:.2f} ms")
        print(f"  p90:             {p90:.2f} ms")
        print(f"  p95:             {p95:.2f} ms")
        print(f"  p99:             {p99:.2f} ms")
        
    if failed_requests:
        print("\nFailed Requests Breakdown:")
        error_counts = {}
        for r in failed_requests:
            err = r["error"] or "Unknown error"
            error_counts[err] = error_counts.get(err, 0) + 1
        for err, count in error_counts.items():
            print(f"  - Count: {count} | {err}")
            
    print("=" * 60)

if __name__ == "__main__":
    # Concurrency and total requests can be configured via CLI arguments
    concurrency = 5
    total_requests = 20
    
    if len(sys.argv) > 1:
        try:
            concurrency = int(sys.argv[1])
        except ValueError:
            pass
    if len(sys.argv) > 2:
        try:
            total_requests = int(sys.argv[2])
        except ValueError:
            pass
            
    asyncio.run(run_stress_test(concurrency, total_requests))
