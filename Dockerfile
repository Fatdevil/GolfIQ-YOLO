# syntax=docker/dockerfile:1
# -------- Web build --------
ARG PY_IMAGE=python:3.11-slim
FROM node:20-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci || npm install
COPY web/ .
RUN npm run build

# -------- Python runtime --------
ARG PY_IMAGE=python:3.11-slim
FROM ${PY_IMAGE} AS runtime

# System libs for opencv/ffmpeg (video extras)
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

WORKDIR /app
# Install deps first (cache friendly)
COPY requirements.txt* requirements-dev.txt* ./
RUN pip install --upgrade pip && \
    (pip install -r requirements.txt || true) && \
    pip install -r requirements-dev.txt

# Optionally install video extras
ARG VIDEO_EXTRAS=0

# App code
COPY . .
# Prebuilt web bundle
COPY --from=web /web/dist /app/web/dist

# Install package (editable not needed in container)
RUN pip install -e .

# Optionally install video extras
RUN if [ "$VIDEO_EXTRAS" = "1" ]; then pip install -e ".[video]"; fi

# Non-root
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

ENV SERVE_WEB=0 PORT=8000 HOST=0.0.0.0 GOLFIQ_MOCK=1 \
    GOLFIQ_RUNS_DIR=/data/runs RUNS_UPLOAD_DIR=/data/uploads \
    GOLFIQ_ROUNDS_DIR=/data/rounds GOLFIQ_BAGS_DIR=/data/bags \
    FEATURE_FLAGS_CONFIG_PATH=/data/config/feature_flags.json
EXPOSE 8000
VOLUME ["/data/runs", "/data/uploads", "/data/rounds", "/data/bags", "/data/config"]

# Build info for /health endpoint
ARG BUILD_VERSION=dev
ARG GIT_SHA=unknown
ENV BUILD_VERSION=${BUILD_VERSION} GIT_SHA=${GIT_SHA}

CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8000"]
