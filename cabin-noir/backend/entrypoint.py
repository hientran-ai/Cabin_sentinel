"""Container entrypoint: fix ownership of the data volume (it may have been created by an older root-run image), drop root, start uvicorn."""
import os
import sys

UID = GID = 10001
DATA = os.environ.get("CABIN_DATA_DIR", "/data")

if os.geteuid() == 0:
    for root, dirs, files in os.walk(DATA):
        for name in dirs + files:
            try:
                os.chown(os.path.join(root, name), UID, GID)
            except OSError:
                pass
    try:
        os.chown(DATA, UID, GID)
    except OSError:
        pass
    os.setgroups([])
    os.setgid(GID)
    os.setuid(UID)

os.execvp("uvicorn", ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers",
                      "--forwarded-allow-ips", "*", "--no-server-header"] + sys.argv[1:])
