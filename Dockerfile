# ---- Stage 1: Build ----
FROM python:3.11-slim AS builder

WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH

COPY requirements.txt requirements-vision.txt ./
# V1 inference uses CPU; avoid pulling CUDA packages from the default index.
RUN pip install --no-cache-dir torch==2.14.0+cpu torchvision==0.29.0+cpu \
        --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt -r requirements-vision.txt \
    && pip check

# ---- Stage 2: Production ----
FROM python:3.11-slim

WORKDIR /app

# OpenCV's standard wheel needs these shared libraries in the slim runtime.
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Installed packages remain readable after switching to the unprivileged user.
COPY --from=builder /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
ENV YOLO_CONFIG_DIR=/tmp/ultralytics
ENV YOLO_AUTOINSTALL=false

# Security: run as non-root user
RUN useradd -m appuser

# Copy only runtime application code; model weights are supplied separately.
COPY src ./src

# Create data directory with correct ownership
RUN mkdir -p /app/data /tmp/ultralytics && chown -R appuser:appuser /app /tmp/ultralytics

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-m", "src.healthcheck"]

CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
