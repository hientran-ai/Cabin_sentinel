"""Compatibility namespace for the relocated backend.

The deployable FastAPI service now lives in ``services/api/src``. Keeping this
small namespace bridge preserves existing imports such as ``src.main`` and
``src.cabinsentinel`` while downstream deployments migrate at their own pace.
"""

from pathlib import Path

_BACKEND_SOURCE = Path(__file__).resolve().parents[1] / "services" / "api" / "src"
__path__ = [str(_BACKEND_SOURCE)]
