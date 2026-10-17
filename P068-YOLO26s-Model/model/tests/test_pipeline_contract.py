"""Contract checks for the independent backend integration boundary."""

import hashlib
import json
from threading import Lock
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from p068_vision import Pipeline, verify_assets


def test_asset_verification_rejects_missing_and_corrupt_checkpoints(tmp_path, monkeypatch):
    import p068_vision.pipeline as module

    folder = tmp_path / "metadata"
    folder.mkdir()
    (folder / "assets.json").write_text(json.dumps({"weights.pt": {
        "bytes": 3, "sha256": hashlib.sha256(b"abc").hexdigest(), "role": "detector",
    }}))
    monkeypatch.setattr(module, "files", lambda _package: folder)
    with pytest.raises(FileNotFoundError):
        verify_assets(tmp_path)
    (tmp_path / "weights.pt").write_bytes(b"bad")
    with pytest.raises(ValueError, match="checksum"):
        verify_assets(tmp_path)
    (tmp_path / "weights.pt").write_bytes(b"abc")
    assert verify_assets(tmp_path)["detector"] == tmp_path / "weights.pt"


def test_exterior_people_are_masked_before_separation_and_raw_evidence_is_removed():
    pipeline = Pipeline.__new__(Pipeline)
    evidence = {"person_boxes": [[0, 0, 10, 10]]}
    outside = {"class": "person", "cabin_membership": {"label": "outside"}}
    uncertain = {"class": "person", "age_group": "unknown"}
    pipeline._preview = Mock(return_value={"status": "PROCESSED"})
    frame = {"detections": [outside, uncertain], "_face_evidence": evidence}
    decoded = SimpleNamespace(source=b"image")
    result = pipeline._finish(frame, decoded, False)
    assert result["detections"] == [uncertain]
    assert result["exterior_detections"] == [outside]
    assert "_face_evidence" not in result
    assert pipeline._preview.call_args.kwargs["face_evidence"] is evidence
    assert pipeline._preview.call_args.kwargs["include_image"] is False
    json.dumps(result, allow_nan=False)


def test_shutdown_is_idempotent_and_rejects_further_requests():
    pipeline = Pipeline.__new__(Pipeline)
    pipeline._lock, pipeline._closed = Lock(), False
    pipeline._provider = Mock()
    pipeline.close()
    pipeline.close()
    pipeline._provider.close.assert_called_once()
    with pytest.raises(RuntimeError, match="closed"):
        pipeline.infer(b"image")
    with pytest.raises(RuntimeError, match="closed"):
        pipeline.infer_frame(None)
