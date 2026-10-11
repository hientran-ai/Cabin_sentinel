"""SQLite storage. One shared connection; the schema is created and upgraded by migrations.py on first use."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from typing import Any, Iterator

from . import migrations

DB_PATH = os.environ.get("CABIN_DB", os.path.join(os.path.dirname(__file__), "..", "cabinsentinel.db"))

_lock = threading.RLock()


_tx_state = threading.local()
_reader_state = threading.local()
_gen = 0


def connect(readonly: bool = False) -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=8000")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA cache_size=-20000")
    if readonly:
        conn.execute("PRAGMA query_only=ON")
    else:
        conn.execute("PRAGMA journal_mode=WAL")      # readers never block the writer and the writer never blocks readers
        conn.execute("PRAGMA synchronous=NORMAL")    # safe with WAL: a crash can lose the last commit, never corrupt the file
        conn.execute("PRAGMA secure_delete=ON")      # deleted personal data is overwritten, not left in free pages
    return conn


_conn: sqlite3.Connection | None = None


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = connect()
        migrations.run(_conn)
        if DB_PATH != ":memory:":
            for suffix in ("", "-wal", "-shm"):
                try:
                    os.chmod(DB_PATH + suffix, 0o600)
                except OSError:
                    pass
    return _conn


def reset(path: str | None = None) -> None:
    """Point the store at a fresh database (used by tests)."""
    global _conn, DB_PATH, _gen
    if _conn is not None:
        _conn.close()
        _conn = None
    _gen += 1
    if path:
        DB_PATH = path
    get_conn()


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    with _lock:
        conn = get_conn()
        conn.execute("BEGIN IMMEDIATE")
        _tx_state.depth = getattr(_tx_state, "depth", 0) + 1
        try:
            yield conn
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            _tx_state.depth -= 1


def _read_conn() -> tuple[sqlite3.Connection, bool]:
    """Reads run on a per-thread read-only connection so they do not queue behind the writer. A thread inside tx() keeps using the
    writer connection so it still sees its own uncommitted changes."""
    if getattr(_tx_state, "depth", 0) > 0 or DB_PATH == ":memory:":
        return get_conn(), True
    get_conn()
    c = getattr(_reader_state, "conn", None)
    if c is None or getattr(_reader_state, "gen", -1) != _gen:
        if c is not None:
            c.close()
        c = connect(readonly=True)
        _reader_state.conn, _reader_state.gen = c, _gen
    return c, False


def one(sql: str, *args: Any) -> sqlite3.Row | None:
    conn, locked = _read_conn()
    if locked:
        with _lock:
            return conn.execute(sql, args).fetchone()
    return conn.execute(sql, args).fetchone()


def all_(sql: str, *args: Any) -> list[sqlite3.Row]:
    conn, locked = _read_conn()
    if locked:
        with _lock:
            return conn.execute(sql, args).fetchall()
    return conn.execute(sql, args).fetchall()


def dumps(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False)


def loads(s: str) -> Any:
    return json.loads(s)
