"""FFmpeg/FFprobe helpers. Commands are argument lists (never shell strings), run with time and
resource limits, against worker-generated file names only."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:  # POSIX only; on Windows (local development) FFmpeg still runs with the timeout
    import resource
except ImportError:  # pragma: no cover - Windows
    resource = None  # type: ignore[assignment]

ALLOWED_CONTAINERS = {"mov", "mp4", "m4a", "3gp", "3g2", "mj2"}  # ffprobe's mov/mp4 demuxer family
ALLOWED_VIDEO_CODECS = {"h264", "hevc", "mpeg4", "prores", "av1", "vp9"}
BROWSER_SAFE_CODECS = {"h264"}


class MediaError(Exception):
    """A user-facing, non-retryable problem with the uploaded media."""


@dataclass
class ProbeResult:
    duration_s: float
    width: int
    height: int
    display_width: int
    display_height: int
    fps: float
    rotation: int
    video_codec: str
    pix_fmt: str | None
    has_audio: bool
    size_bytes: int
    container: str
    raw: dict[str, Any]

    def as_meta(self, sha256: str) -> dict[str, Any]:
        return {
            "duration_s": round(self.duration_s, 3),
            "width": self.width,
            "height": self.height,
            "display_width": self.display_width,
            "display_height": self.display_height,
            "fps": round(self.fps, 3),
            "rotation": self.rotation,
            "video_codec": self.video_codec,
            "has_audio": self.has_audio,
            "size_bytes": self.size_bytes,
            "sha256": sha256,
            "raw": {
                "format_name": self.raw.get("format", {}).get("format_name"),
                "bit_rate": self.raw.get("format", {}).get("bit_rate"),
                "streams": [
                    {k: s.get(k) for k in ("codec_type", "codec_name", "profile", "pix_fmt", "avg_frame_rate", "sample_rate")}
                    for s in self.raw.get("streams", [])
                ],
            },
        }


def _limits(cpu_seconds: int, memory_bytes: int):
    def apply() -> None:
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

    return apply


def run(cmd: list[str], timeout: int = 600, cpu_seconds: int = 900, memory_bytes: int = 3 * 1024**3) -> subprocess.CompletedProcess:
    if not cmd or cmd[0] not in ("ffmpeg", "ffprobe"):
        raise ValueError("Only ffmpeg/ffprobe may be executed")
    return subprocess.run(
        cmd,
        capture_output=True,
        timeout=timeout,
        check=False,
        preexec_fn=_limits(cpu_seconds, memory_bytes) if resource else None,  # noqa: PLW1509 - limits only, no shell
        stdin=subprocess.DEVNULL,
    )


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _fraction(v: str | None) -> float:
    if not v or v in ("0/0", "N/A"):
        return 0.0
    if "/" in v:
        n, d = v.split("/", 1)
        return float(n) / float(d) if float(d) else 0.0
    return float(v)


def _rotation(stream: dict[str, Any]) -> int:
    for sd in stream.get("side_data_list", []) or []:
        if "rotation" in sd:
            return int(round(float(sd["rotation"]))) % 360
    tag = (stream.get("tags") or {}).get("rotate")
    return int(tag) % 360 if tag else 0


def probe(path: Path, timeout: int = 60) -> ProbeResult:
    """Probe real container/stream properties. Extension and browser MIME type are never trusted."""
    p = run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)], timeout=timeout)
    if p.returncode != 0:
        raise MediaError("This file is not a readable video (it may be corrupt or incomplete).")
    try:
        data = json.loads(p.stdout or b"{}")
    except json.JSONDecodeError as e:
        raise MediaError("This file is not a readable video.") from e
    fmt = data.get("format") or {}
    containers = set((fmt.get("format_name") or "").split(","))
    if not containers & ALLOWED_CONTAINERS:
        raise MediaError(f"Unsupported container ({fmt.get('format_name') or 'unknown'}). Upload an MP4 or MOV file.")
    videos = [s for s in data.get("streams", []) if s.get("codec_type") == "video" and not (s.get("disposition") or {}).get("attached_pic")]
    if not videos:
        raise MediaError("The file has no video track.")
    v = videos[0]
    codec = v.get("codec_name") or "unknown"
    if codec not in ALLOWED_VIDEO_CODECS:
        raise MediaError(f"Unsupported video codec ({codec}). Export as H.264 or HEVC MP4/MOV.")
    duration = float(fmt.get("duration") or v.get("duration") or 0)
    if duration <= 0:
        raise MediaError("Could not determine the video duration.")
    width, height = int(v.get("width") or 0), int(v.get("height") or 0)
    if width <= 0 or height <= 0:
        raise MediaError("Could not determine the video dimensions.")
    rot = _rotation(v)
    dw, dh = (height, width) if rot in (90, 270) else (width, height)
    fps = _fraction(v.get("avg_frame_rate")) or _fraction(v.get("r_frame_rate"))
    return ProbeResult(
        duration_s=duration,
        width=width,
        height=height,
        display_width=dw,
        display_height=dh,
        fps=fps,
        rotation=rot,
        video_codec=codec,
        pix_fmt=v.get("pix_fmt"),
        has_audio=any(s.get("codec_type") == "audio" for s in data.get("streams", [])),
        size_bytes=int(fmt.get("size") or path.stat().st_size),
        container=fmt.get("format_name") or "",
        raw=data,
    )


def verify_decodes(path: Path, duration_s: float, timeout: int = 120) -> None:
    """Decode a short slice at the start and end to catch truncated or corrupt uploads."""
    for start in sorted({0.0, max(0.0, duration_s - 2.0)}):
        p = run(
            ["ffmpeg", "-v", "error", "-xerror", "-ss", f"{start:.3f}", "-i", str(path), "-t", "1.5", "-map", "0:v:0", "-f", "null", "-"],
            timeout=timeout,
        )
        if p.returncode != 0:
            raise MediaError("The video could not be decoded completely (the upload may be truncated or corrupt).")


def needs_preview(pr: ProbeResult) -> bool:
    return pr.video_codec not in BROWSER_SAFE_CODECS or (pr.pix_fmt not in (None, "yuv420p", "yuvj420p"))


def make_preview(src: Path, dest: Path, timeout: int = 900) -> None:
    """Browser-compatible H.264 preview. FFmpeg applies rotation metadata (autorotate) when transcoding."""
    p = run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(src),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale='min(1280,iw)':-2",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "26",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            str(dest),
        ],
        timeout=timeout,
    )
    if p.returncode != 0:
        raise MediaError("Could not create a browser-compatible preview of this video.")


_SHOWINFO = re.compile(rb"n:\s*(\d+).*?pts_time:\s*([0-9.]+)")


def extract_frames(
    src: Path, out_dir: Path, start_s: float, duration_s: float, fps: float, long_edge: int, timeout: int = 300
) -> list[tuple[Path, float]]:
    """Extract JPEG frames for [start_s, start_s+duration_s) at `fps`, returning (path, absolute time in source seconds).

    Uses accurate input seeking; timestamps come from FFmpeg's own showinfo output, not from assumptions.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    scale = f"scale='if(gte(iw,ih),min({long_edge},iw),-2)':'if(gte(iw,ih),-2,min({long_edge},ih))'"
    p = run(
        [
            "ffmpeg",
            "-v",
            "info",
            "-nostats",
            "-y",
            "-ss",
            f"{start_s:.3f}",
            "-i",
            str(src),
            "-t",
            f"{duration_s:.3f}",
            "-map",
            "0:v:0",
            "-vf",
            f"fps={fps},{scale},showinfo",
            "-q:v",
            "4",
            "-f",
            "image2",
            str(out_dir / "f_%05d.jpg"),
        ],
        timeout=timeout,
    )
    if p.returncode != 0:
        raise MediaError("Frame extraction failed for this excerpt.")
    times = [float(m.group(2)) for m in _SHOWINFO.finditer(p.stderr)]
    files = sorted(out_dir.glob("f_*.jpg"))
    if not files:
        raise MediaError("No frames could be extracted from this excerpt.")
    if len(times) != len(files):
        # Fall back to the nominal sampling grid if showinfo lines were not all parsed.
        times = [i / fps for i in range(len(files))]
    return [(f, round(start_s + t, 3)) for f, t in zip(files, times, strict=True)]
