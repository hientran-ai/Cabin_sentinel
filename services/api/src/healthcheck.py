"""Docker process/store liveness; /health remains the demo readiness response."""

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


def main() -> int:
    url = f"http://127.0.0.1:{os.getenv('PORT', '8000')}/health"
    try:
        try:
            response = urlopen(url, timeout=3)
        except HTTPError as exc:
            response = exc
        with response:
            status = response.code
            health = json.load(response)
    except (OSError, ValueError, URLError):
        return 1
    if (
        status not in {200, 503}
        or not isinstance(health, dict)
        or health.get("backend") != "ready"
        or health.get("database") != "ready"
    ):
        return 1
    print(f"Backend process/store live; demo readiness HTTP {status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
