"""Request-local decoded pixels shared by inference and privacy preview."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DecodedImage:
    source: bytes
    pixels: Any

    @classmethod
    def from_bgr(cls, pixels):
        """Own a camera frame so later capture-buffer reuse cannot change evidence."""
        import numpy as np

        if (not isinstance(pixels, np.ndarray) or pixels.dtype != np.uint8
                or pixels.ndim != 3 or pixels.shape[2] != 3
                or not pixels.shape[0] or not pixels.shape[1]):
            raise ValueError("Expected a nonempty uint8 BGR camera frame")
        owned = pixels.copy(order="C")
        owned.flags.writeable = False
        return cls(owned.tobytes(), owned)

    @classmethod
    def decode(cls, source):
        import cv2
        import numpy as np

        pixels = cv2.imdecode(np.frombuffer(source, dtype=np.uint8), cv2.IMREAD_COLOR)
        if pixels is None:
            raise ValueError("Cannot decode image for Vision inference")
        return cls(source, pixels)
