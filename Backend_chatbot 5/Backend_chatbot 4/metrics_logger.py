import json
import os
import time
from datetime import datetime, timedelta
from threading import Lock

METRICS_FILE = "data/metrics.jsonl"
_log_lock = Lock()

def log_request_metrics(
    endpoint: str,
    status_code: int,
    response_time_ms: float,
    model: str = "unknown",
    on_topic: bool = True,
    has_sources: bool = True,
    error: str = None
):
    """
    Append a single request record to the metrics log file.
    Thread-safe using a Lock.
    """
    ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
    record = {
        "timestamp": ist_now.isoformat() + "+05:30",
        "endpoint": endpoint,
        "status_code": status_code,
        "response_time_ms": round(response_time_ms, 2),
        "model": model,
        "on_topic": on_topic,
        "has_sources": has_sources,
        "error": error
    }

    try:
        # Ensure data directory exists
        os.makedirs(os.path.dirname(METRICS_FILE), exist_ok=True)
        
        with _log_lock:
            with open(METRICS_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
    except Exception as e:
        print(f"⚠️ Metrics logging failed: {e}")

def get_metrics_summary():
    """
    Read the log file and compute aggregated summary for the dashboard.
    """
    if not os.path.exists(METRICS_FILE):
        return {
            "total_questions": 0,
            "avg_response_time": 0.0,
            "success_rate": 0.0,
            "failure_rate": 0.0,
            "grounding_rate": 0.0,
            "on_topic_rate": 0.0,
            "status": "no_data"
        }

    records = []
    with _log_lock:
        try:
            with open(METRICS_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        records.append(json.loads(line))
        except Exception as e:
            print(f"⚠️ Error reading metrics: {e}")
            return {"status": "error", "message": str(e)}

    if not records:
        return {"total_questions": 0, "status": "empty"}

    total = len(records)
    successes = [r for r in records if 200 <= r["status_code"] < 300]
    failures = [r for r in records if r["status_code"] >= 400]
    
    # Filter only for /chat endpoint for specific chatbot metrics
    chat_records = [r for r in records if r["endpoint"] == "/chat"]
    total_chat = len(chat_records)

    avg_time = sum(r["response_time_ms"] for r in records) / total
    
    success_rate = (len(successes) / total) * 100 if total > 0 else 0
    failure_rate = (len(failures) / total) * 100 if total > 0 else 0
    
    grounding_rate = (sum(1 for r in chat_records if r["has_sources"]) / total_chat * 100) if total_chat > 0 else 0
    on_topic_rate = (sum(1 for r in chat_records if r["on_topic"]) / total_chat * 100) if total_chat > 0 else 0

    # Get history for the performance trend (last 10 chat requests)
    history = []
    for r in chat_records[-10:]:
        # Parse timestamp to something short like "10:05"
        try:
            # Parse timestamp (handles both UTC and IST formats)
            ts_str = r["timestamp"].replace("Z", "+00:00")
            ts = datetime.fromisoformat(ts_str)
            
            # If it's UTC, convert to IST. If already IST, keep as is.
            if ts.utcoffset() is None or ts.utcoffset().total_seconds() == 0:
                ts = ts + timedelta(hours=5, minutes=30)
                
            label = ts.strftime("%H:%M")
        except:
            label = "Now"
        
        history.append({
            "name": label,
            "aiResponseTime": round(r["response_time_ms"] / 1000, 2),
            "networkLatency": round((r["response_time_ms"] * 0.1) / 1000, 2) # Synthetic latency for demo
        })

    return {
        "total_questions": total_chat,
        "avg_response_time": round(avg_time / 1000, 2),
        "success_rate": round(success_rate, 1),
        "failure_rate": round(failure_rate, 1),
        "grounding_rate": round(grounding_rate, 1),
        "on_topic_rate": round(on_topic_rate, 1),
        "history": history,
        "status": "operational"
    }
