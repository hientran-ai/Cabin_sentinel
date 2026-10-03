"""Reject untrusted artifacts and report incomplete model sets honestly."""
import importlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

ABC_SHA = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
ROOT = Path(__file__).resolve().parents[1]


def assets():
    assert importlib.util.find_spec('src.vision.model_assets'), 'Model packaging implementation is missing'
    return importlib.import_module('src.vision.model_assets')


def test_hash_failure_does_not_publish_or_replace_a_model(tmp_path):
    module = assets()
    target = tmp_path / 'model.pt'
    with pytest.raises(ValueError, match='checksum'):
        module.write_verified(b'wrong', target, ABC_SHA)
    assert not target.exists()
    target.write_bytes(b'existing-model')
    with pytest.raises(FileExistsError):
        module.write_verified(b'abc', target, ABC_SHA)
    assert target.read_bytes() == b'existing-model'


def test_verified_install_is_idempotent_and_rejects_invalid_digest(tmp_path):
    module = assets()
    target = tmp_path / 'model.pt'
    module.write_verified(b'abc', target, ABC_SHA)
    before = target.stat().st_mtime_ns
    module.write_verified(b'abc', target, ABC_SHA)
    assert target.read_bytes() == b'abc'
    assert target.stat().st_mtime_ns == before
    with pytest.raises(ValueError, match='SHA-256'):
        module.write_verified(b'abc', tmp_path / 'other.pt', 'unknown')
    assert not (tmp_path / 'other.pt').exists()


def test_age_import_requires_checksum_and_missing_age_is_never_complete(tmp_path):
    module = assets()
    source = tmp_path / 'source.pt'
    source.write_bytes(b'abc')
    directory = tmp_path / 'models'
    manifest = {'age-router': {'filename': 'age-real-router-20261002.pt', 'sha256': None, 'url': None}}
    before = module.model_report(directory, manifest)
    assert before['age-router']['status'] == 'MISSING'
    with pytest.raises(ValueError, match='checksum'):
        module.import_age(source, directory, '0' * 64)
    assert not (directory / 'age-real-router-20261002.pt').exists()
    module.import_age(source, directory, ABC_SHA)
    assert module.model_report(directory, manifest)['age-router']['status'] == 'VERIFIED'
    (directory / 'age-real-router-20261002.pt').write_bytes(b'corrupt')
    assert module.model_report(directory, manifest)['age-router']['status'] == 'CHECKSUM_MISMATCH'


def test_unpinned_external_checkpoint_is_explicitly_unverified(tmp_path):
    module = assets()
    (tmp_path / 'age-real-router-20261002.pt').write_bytes(b'abc')
    manifest = {'age-router': {'filename': 'age-real-router-20261002.pt', 'sha256': None, 'url': None}}
    assert module.model_report(tmp_path, manifest)['age-router']['status'] == 'UNVERIFIED'


def test_offline_cli_check_exits_nonzero_for_missing_age(tmp_path):
    assert (ROOT / 'scripts/prepare_vision_models.py').is_file(), 'Model preparation command is missing'
    result = subprocess.run([sys.executable, str(ROOT / 'scripts/prepare_vision_models.py'),
                             '--check', '--models', 'age-router', '--directory', str(tmp_path)],
                            capture_output=True, text=True, check=False)
    assert result.returncode == 1
    report = json.loads(result.stdout)
    assert report['complete'] is False
    assert report['models']['age-router']['status'] == 'MISSING'
    assert list(tmp_path.iterdir()) == []


def test_baotam_router_source_is_available_for_offline_inference():
    assert importlib.util.find_spec('src.vision.age'), 'Latest BaoTam age-router inference is missing'


def test_downloader_rejects_corrupt_transport_before_publication(tmp_path, monkeypatch):
    from io import BytesIO
    module = assets()
    spec = {'filename': 'model.pt', 'sha256': ABC_SHA, 'url': 'https://example.test/model.pt'}
    monkeypatch.setattr(module, 'urlopen', lambda *_args, **_kwargs: BytesIO(b'corrupt'))
    with pytest.raises(ValueError, match='checksum'):
        module.download_asset(spec, tmp_path)
    assert list(tmp_path.iterdir()) == []
    monkeypatch.setattr(module, 'urlopen', lambda *_args, **_kwargs: BytesIO(b'abc'))
    module.download_asset(spec, tmp_path)
    assert (tmp_path / 'model.pt').read_bytes() == b'abc'


def test_bundled_face_model_loads_and_processes_in_a_fresh_checkout(monkeypatch):
    cv2 = pytest.importorskip('cv2')
    np = pytest.importorskip('numpy')
    from src.cabinsentinel.capabilities import privacy_model
    from src.vision.preview import FacePreview
    monkeypatch.delenv('FACE_MODEL_PATH', raising=False)
    assert privacy_model()['available'] is True
    encoded, image = cv2.imencode('.png', np.zeros((64, 64, 3), dtype=np.uint8))
    assert encoded
    processed = FacePreview()(image.tobytes())
    assert processed['status'] == 'PROCESSED'
    assert processed['detected_faces'] == 0
    assert processed['width'] == processed['height'] == 64
