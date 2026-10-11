FROM python:3.12-slim
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app && mkdir -p /data && chown app /data
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "uvicorn[standard]"
COPY app app
COPY web web
COPY entrypoint.py backup_db.py import_replay.py ./
ENV CABIN_ENV=production CABIN_DB=/data/cabinsentinel.db CABIN_MEDIA=/data/media PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
VOLUME /data
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=4).status==200 else 1)"
# One worker on purpose: SQLite plus the in-process alert worker. The entrypoint starts as root only to fix volume ownership, then drops to uid 10001.
ENTRYPOINT ["python", "entrypoint.py"]
