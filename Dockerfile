# Build the React SPA
FROM node:20-slim AS frontend-builder

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Final FastAPI image
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PYTHONPATH=/app

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libheif-examples \
    libffi-dev \
    sqlite3 \
    wget \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /data /app/uploads /app/tile-cache /app/backups /backups

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

ENV SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64 \
    SUPERCRONIC_SHA1SUM=cd48d45c4b10f3f0bfdd3a57d054cd05ac96812b
RUN wget -q -O /usr/local/bin/supercronic "$SUPERCRONIC_URL" \
    && echo "${SUPERCRONIC_SHA1SUM}  /usr/local/bin/supercronic" | sha1sum -c - \
    && chmod +x /usr/local/bin/supercronic

COPY backend/app /app/app
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Supercronic expects crontab lines without a user field.
COPY crontab /app/crontab

EXPOSE 8000

CMD ["sh", "-c", "mkdir -p /var/log && touch /var/log/percursos-backup.log && supercronic /app/crontab >> /var/log/percursos-backup.log 2>&1 & uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
# Init script
COPY scripts/init_prepare.py /app/init_prepare.py
RUN chmod +x /app/init_prepare.py
