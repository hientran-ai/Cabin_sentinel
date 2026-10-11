#!/usr/bin/env python3
"""Consistent online backup of the SQLite database (safe while the server runs), gzip, keep the newest N.
Usage: python3 scripts/backup_db.py /data/cabinsentinel.db /backups [keep=14]
Cron example (daily 03:10):  10 3 * * * docker compose exec -T api python /srv/backup_db.py /data/cabinsentinel.db /data/backups
Back up off the machine too; a backup on the same disk does not protect against losing the disk."""
import gzip
import os
import shutil
import sqlite3
import sys
import time

src, dest = sys.argv[1], sys.argv[2]
keep = int(sys.argv[3]) if len(sys.argv) > 3 else 14
os.makedirs(dest, exist_ok=True)
stamp = time.strftime("%Y%m%d-%H%M%S")
tmp = os.path.join(dest, f"cabin-{stamp}.db")
con = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
out = sqlite3.connect(tmp)
con.backup(out)
out.close()
con.close()
with open(tmp, "rb") as f, gzip.open(tmp + ".gz", "wb") as g:
    shutil.copyfileobj(f, g)
os.remove(tmp)
os.chmod(tmp + ".gz", 0o600)
for old in sorted(f for f in os.listdir(dest) if f.startswith("cabin-") and f.endswith(".db.gz"))[:-keep]:
    os.remove(os.path.join(dest, old))
print(tmp + ".gz")
