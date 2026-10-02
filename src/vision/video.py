"""Encode browser-compatible H.264 MP4 without overwriting existing outputs."""

import subprocess
from contextlib import contextmanager
from pathlib import Path

import imageio_ffmpeg


def encode_h264(source, destination):
    source, destination = Path(source), Path(destination)
    if not source.is_file():
        raise FileNotFoundError(source)
    if destination.exists():
        raise FileExistsError(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            imageio_ffmpeg.get_ffmpeg_exe(),
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-n",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-an",
            str(destination),
        ],
        check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


@contextmanager
def mp4_writer(destination, fps, size):
    """Release an allocated encoder on initialization failure or processing error."""
    import cv2

    writer = cv2.VideoWriter(str(destination), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    try:
        if not writer.isOpened():
            raise RuntimeError("Cannot initialize MP4 encoder")
        yield writer
    finally:
        writer.release()
