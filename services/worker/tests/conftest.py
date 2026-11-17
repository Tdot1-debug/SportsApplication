"""Shared fixtures. Synthetic videos are generated with FFmpeg at test time; no private media is used."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from smarvii_worker.config import Config


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


@pytest.fixture(scope="session")
def synthetic_mp4(tmp_path_factory) -> Path:
    """6 s, 640x480, 30 fps H.264 test pattern with a running timestamp."""
    p = tmp_path_factory.mktemp("media") / "synthetic.mp4"
    _ffmpeg("-f", "lavfi", "-i", "testsrc2=size=640x480:rate=30:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(p))
    return p


@pytest.fixture(scope="session")
def rotated_mov(tmp_path_factory) -> Path:
    """Portrait phone-style clip: landscape pixels with a 90-degree display matrix."""
    d = tmp_path_factory.mktemp("media")
    raw = d / "raw.mp4"
    p = d / "rotated.mov"
    _ffmpeg("-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(raw))
    _ffmpeg("-display_rotation", "90", "-i", str(raw), "-c", "copy", str(p))
    return p


@pytest.fixture(scope="session")
def hevc_mp4(tmp_path_factory) -> Path | None:
    p = tmp_path_factory.mktemp("media") / "hevc.mp4"
    try:
        _ffmpeg(
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x240:rate=30:duration=2",
            "-c:v",
            "libx265",
            "-pix_fmt",
            "yuv420p",
            "-tag:v",
            "hvc1",
            str(p),
        )
    except subprocess.CalledProcessError:
        return None
    return p


@pytest.fixture
def cfg(tmp_path) -> Config:
    return Config(
        supabase_url="http://localhost",
        supabase_secret_key="x",
        worker_id="test",
        tmp_dir=str(tmp_path),
        analysis_provider="mock",
        test_mode=True,
        input_usd_per_mtok=4.0,
        output_usd_per_mtok=20.0,
    )
