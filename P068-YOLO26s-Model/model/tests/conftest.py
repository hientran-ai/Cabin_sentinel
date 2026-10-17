"""Keep the optional model suite separate from backend-only test runs."""

from importlib.util import find_spec

# model/pyproject.toml supplies model/src for the documented standalone command.
# A backend-only checkout/test environment need not install the model package.
collect_ignore_glob = ["test_*.py"] if find_spec("p068_vision") is None else []
