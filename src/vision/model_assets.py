"""Explicit setup of local model assets; never called by inference or risk rules."""

import hashlib
import os
import re
import tempfile
from pathlib import Path
from urllib.request import urlopen

AGE_FILENAME = "age-real-router-20261002.pt"


def valid_digest(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise ValueError("An explicit lowercase SHA-256 digest is required")
    return value


def checksum(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_verified(data, destination, expected):
    """Publish only exact bytes, without overwriting a different existing model."""
    expected = valid_digest(expected)
    destination = Path(destination)
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Model checksum mismatch: {destination.name}")
    if destination.exists():
        if checksum(destination) == expected:
            return
        raise FileExistsError(f"Existing model has another checksum: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(data)
    try:
        # Hard-link publication refuses to replace a concurrent install.
        os.link(temporary, destination)
    finally:
        temporary.unlink()


def import_age(source, directory, expected):
    """Check owner-supplied integrity only; no training or safety validation claim."""
    destination = Path(directory) / AGE_FILENAME
    write_verified(Path(source).read_bytes(), destination, expected)
    destination.with_suffix(".pt.sha256").write_text(valid_digest(expected) + "\n")


def download_asset(spec, directory):
    """Setup-time network only, using the public URL/digest from the manifest."""
    destination = Path(directory) / spec["filename"]
    expected = valid_digest(spec["sha256"])
    if destination.is_file() and checksum(destination) == expected:
        return
    if destination.exists():
        raise FileExistsError(f"Existing model has another checksum: {destination}")
    if not spec["url"]:
        raise ValueError("Model has no published source URL")
    with urlopen(spec["url"], timeout=60) as response:
        data = response.read()
    write_verified(data, destination, expected)


def model_report(directory, manifest):
    """Observe only local files. Missing/unpinned files never count as verified."""
    report = {}
    for name, spec in manifest.items():
        path = Path(directory) / spec["filename"]
        expected = spec["sha256"]
        if expected is None:
            sidecar = path.with_suffix(".pt.sha256")
            if sidecar.is_file():
                candidate = sidecar.read_text().strip()
                expected = candidate if re.fullmatch(r"[0-9a-f]{64}", candidate) else None
        actual = checksum(path) if path.is_file() else None
        status = ("MISSING" if actual is None else "UNVERIFIED" if expected is None else
                  "VERIFIED" if actual == expected else "CHECKSUM_MISMATCH")
        report[name] = {"status": status, "filename": spec["filename"], "sha256": actual,
                        "expected_sha256": expected}
    return report
