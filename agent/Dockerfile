# ============================================================
# Agent Dockerfile — Python 3.12-slim
# Lightweight; only psutil + httpx needed.
# ============================================================

FROM python:3.12-slim

WORKDIR /app

# Install build deps for psutil C extension:
# gcc = compiler, python3-dev = Python headers (stdlib.h, Python.h)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy agent source
COPY agent ./agent

CMD ["python", "-m", "agent.main"]
