FROM python:3.10-slim

WORKDIR /app

# Install system dependencies (build-essential, wave, etc.)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Expose port
EXPOSE 8000

# Command to run uvicorn
CMD ["uvicorn", "api_server:app", "--host", "0.0.0.0", "--port", "8000"]
