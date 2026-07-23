import time
import requests
import sys

BASE_URL = "http://localhost:8000"
PDF_PATH = "pdfs/media_literacy_100Q.pdf"

def main():
    print(f"Uploading {PDF_PATH} to {BASE_URL}/upload-pdf ...")
    
    start_time = time.time()
    
    try:
        with open(PDF_PATH, "rb") as f:
            files = {"files": f}
            resp = requests.post(f"{BASE_URL}/upload-pdf", files=files)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        print(f"Upload failed: {e}")
        sys.exit(1)
        
    job_id = data.get("job_id")
    print(f"Upload successful. Job ID: {job_id}")
    print("Polling for completion...")
    
    while True:
        try:
            status_resp = requests.get(f"{BASE_URL}/upload-status/{job_id}")
            status_resp.raise_for_status()
            status_data = status_resp.json()
        except Exception as e:
            print(f"Failed to poll status: {e}")
            sys.exit(1)
            
        status = status_data.get("status")
        message = status_data.get("message")
        
        if status == "done":
            end_time = time.time()
            latency = end_time - start_time
            print(f"\n✅ Processing completed successfully!")
            print(f"Message: {message}")
            print(f"Total Latency: {latency:.2f} seconds")
            break
        elif status == "error":
            end_time = time.time()
            latency = end_time - start_time
            error_msg = status_data.get("error")
            print(f"\n❌ Processing failed!")
            print(f"Error: {error_msg}")
            print(f"Time elapsed before error: {latency:.2f} seconds")
            break
        else:
            print(f"Status: {status} | Message: {message} ...", end="\r")
            time.sleep(1)

if __name__ == "__main__":
    main()
