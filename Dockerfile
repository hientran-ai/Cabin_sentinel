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

# Copy the backend and its temporary compatibility namespace. Keeping the
# namespace bridge lets the existing `src.main` deployment command work while
# the physical backend source lives under services/api/src.
COPY services/api/src ./services/api/src
COPY src ./src
# Privacy preview works in a fresh image without an inference-time download.
COPY models/face_detection_yunet_2023mar.onnx models/YUNET-LICENSE ./models/

# Opt-in stock weights for a technical image demo. Never enable this for a
# child-safety accuracy claim; use an approved, evaluated model instead.
ARG BUNDLE_STOCK_DEMO_MODEL=false
RUN if [ "$BUNDLE_STOCK_DEMO_MODEL" = "true" ]; then \
      python -c "from pathlib import Path; import hashlib, urllib.request; data = urllib.request.urlopen('https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt', timeout=120).read(); expected = 'f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36'; actual = hashlib.sha256(data).hexdigest(); assert actual == expected, f'Unexpected model SHA-256: {actual}'; target = Path('/app/models/yolov8n.pt'); target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)"; \
    fi

# Create data directory with correct ownership. /app/data holds the SQLite databases: mount a volume here
# (docker-compose does) or accounts, incidents and the audit log are lost when the container is replaced.
RUN mkdir -p /app/data /tmp/ultralytics && chown -R appuser:appuser /app /tmp/ultralytics
VOLUME ["/app/data"]
ENV STORAGE_PERSISTENT=

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-m", "src.healthcheck"]

CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
