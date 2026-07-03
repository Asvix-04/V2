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
    error: str = None,
    user_id: str = "guest"
):
    """
    Append a single request record to the metrics log file.
    Thread-safe using a Lock.

    user_id ties each record to the requesting user so the dashboard can
    show per-user metrics. Falls back to "guest" for unauthenticated calls.
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
        "error": error,
        "user_id": user_id or "guest"
    }

    try:
        # Ensure data directory exists
        os.makedirs(os.path.dirname(METRICS_FILE), exist_ok=True)
        
        with _log_lock:
            with open(METRICS_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
    except Exception as e:
        print(f"⚠️ Metrics logging failed: {e}")

def get_metrics_summary(window="30d", user_id=None):
    """
    Read the log file and compute aggregated summary for the dashboard.

    user_id: when provided, only records logged for that user are counted.
    Records logged before per-user tracking existed (no user_id field) are
    excluded from any specific user's view — matches the Node bridge's
    per-user filtering behavior in bridgeMetrics.js.
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

    if user_id:
        records = [r for r in records if r.get("user_id") == user_id]

    if not records:
        return {"total_questions": 0, "status": "empty"}

    # Filter by time window
    now = datetime.utcnow()
    if window == "24h":
        start_time = now - timedelta(hours=24)
    elif window == "7d":
        start_time = now - timedelta(days=7)
    else:  # 30d
        start_time = now - timedelta(days=30)

    filtered = []
    for r in records:
        try:
            ts_str = r["timestamp"].replace("Z", "+00:00")
            ts = datetime.fromisoformat(ts_str).replace(tzinfo=None)
            if ts >= start_time:
                filtered.append(r)
        except:
            continue
    
    records = filtered
    if not records:
        return {"total_questions": 0, "status": "empty_window"}

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

    # Calculate health history (last 20 records)
    health_history = []
    for r in records[-20:]:
        # Health score: start with 100, subtract for failures and high latency
        health = 100
        if r["status_code"] >= 400:
            health -= 40 # Major drop for errors
        
        # Latency penalty (above 2s is bad)
        if r["response_time_ms"] > 2000:
            penalty = min(30, (r["response_time_ms"] - 2000) / 100)
            health -= penalty
            
        health = max(0, health)
        
        try:
            ts_str = r["timestamp"].replace("Z", "+00:00")
            ts = datetime.fromisoformat(ts_str)
            if ts.utcoffset() is None or ts.utcoffset().total_seconds() == 0:
                ts = ts + timedelta(hours=5, minutes=30)
            label = ts.strftime("%H:%M:%S")
        except:
            label = "Now"
            
        health_history.append({
            "time": label,
            "health": round(health, 1),
            "is_error": r["status_code"] >= 400
        })

    # Restore history for the performance trend (last 10 chat requests)
    history = []
    for r in chat_records[-10:]:
        try:
            ts_str = r["timestamp"].replace("Z", "+00:00")
            ts = datetime.fromisoformat(ts_str)
            if ts.utcoffset() is None or ts.utcoffset().total_seconds() == 0:
                ts = ts + timedelta(hours=5, minutes=30)
            label = ts.strftime("%H:%M")
        except:
            label = "Now"
        
        history.append({
            "name": label,
            "aiResponseTime": round(r["response_time_ms"] / 1000, 2),
            "networkLatency": round((r["response_time_ms"] * 0.1) / 1000, 2)
        })

    # Calculate percentage change between last two chunks of 5 records
    prev_health = sum(h["health"] for h in health_history[-10:-5]) / 5 if len(health_history) >= 10 else 100
    curr_health = sum(h["health"] for h in health_history[-5:]) / 5 if len(health_history) >= 5 else 100
    
    pct_change = 0
    if prev_health > 0:
        pct_change = ((curr_health - prev_health) / prev_health) * 100

    return {
        "total_questions": total_chat,
        "avg_response_time": round(avg_time / 1000, 2),
        "success_rate": round(success_rate, 1),
        "failure_rate": round(failure_rate, 1),
        "grounding_rate": round(grounding_rate, 1),
        "on_topic_rate": round(on_topic_rate, 1),
        "history": history,
        "health_history": health_history,
        "health_pct_change": round(pct_change, 1),
        "status": "operational" if success_rate > 95 else "outage"
    }
