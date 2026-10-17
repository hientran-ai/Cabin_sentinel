"""Check source and checkpoint integrity from a downloaded repository, using only stdlib."""

import hashlib
import json
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / "model/manifest.json").read_text(encoding="utf-8"))
    failures = []
    for relative, expected in manifest["files"].items():
        path = root / relative
        if not path.is_file():
            failures.append(f"MISSING: {relative}")
            continue
        with path.open("rb") as handle:
            actual = hashlib.file_digest(handle, "sha256").hexdigest()
        if path.stat().st_size != expected["bytes"] or actual != expected["sha256"]:
            failures.append(f"CHECKSUM_MISMATCH: {relative}")
    print(json.dumps({"verified": not failures, "checked_files": len(manifest["files"]),
                      "failures": failures}, indent=2))
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())
