# ============================================================
# Backend Dockerfile — Python 3.12 slim
# Multi-stage: deps layer cached separately from app code.
# ============================================================

# --- Stage 1: dependency builder ---
FROM python:3.12-slim AS builder

WORKDIR /build

# System deps needed to compile asyncpg, psutil (C extensions).
# python3-dev provides Python.h and stdlib.h needed by psutil.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --prefix=/install --no-cache-dir -r requirements.txt

# --- Stage 2: runtime image ---
FROM python:3.12-slim AS runtime

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# System runtime libs: libpq for asyncpg, iputils-ping for ICMP service checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Copy application source and Alembic config
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini

# DB migrations via Alembic, then start Uvicorn
# --reload is safe here because the app volume is bind-mounted in dev.
CMD ["sh", "-c", "python -m alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
