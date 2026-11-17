import pytest

from smarvii_worker import media


def test_probe_synthetic(synthetic_mp4):
    pr = media.probe(synthetic_mp4)
    assert abs(pr.duration_s - 6.0) < 0.1
    assert (pr.width, pr.height) == (640, 480)
    assert abs(pr.fps - 30) < 0.01 and pr.video_codec == "h264" and pr.rotation == 0
    media.verify_decodes(synthetic_mp4, pr.duration_s)
    assert not media.needs_preview(pr)
    meta = pr.as_meta("abc")
    assert meta["sha256"] == "abc" and "raw" in meta


def test_rotation_metadata(rotated_mov):
    pr = media.probe(rotated_mov)
    assert pr.rotation in (90, 270)
    assert (pr.display_width, pr.display_height) == (240, 320)


def test_hevc_needs_preview(hevc_mp4, tmp_path):
    if hevc_mp4 is None:
        pytest.skip("libx265 not available")
    pr = media.probe(hevc_mp4)
    assert pr.video_codec == "hevc" and media.needs_preview(pr)
    out = tmp_path / "preview.mp4"
    media.make_preview(hevc_mp4, out)
    assert media.probe(out).video_codec == "h264"


def test_rejects_non_video(tmp_path):
    fake = tmp_path / "notes.mp4"
    fake.write_text("this is text pretending to be a video")
    with pytest.raises(media.MediaError):
        media.probe(fake)


def test_rejects_truncated(tmp_path, synthetic_mp4):
    data = synthetic_mp4.read_bytes()
    broken = tmp_path / "broken.mp4"
    broken.write_bytes(data[: len(data) // 3])
    with pytest.raises(media.MediaError):
        pr = media.probe(broken)
        media.verify_decodes(broken, pr.duration_s)


def test_rejects_audio_only(tmp_path):
    import subprocess

    p = tmp_path / "audio.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=duration=1", "-c:a", "aac", str(p)], check=True)
    with pytest.raises(media.MediaError, match="no video track"):
        media.probe(p)


def test_extract_frames_timestamps_are_absolute(synthetic_mp4, tmp_path):
    frames = media.extract_frames(synthetic_mp4, tmp_path / "f", 2.0, 2.0, 5.0, 320)
    assert 9 <= len(frames) <= 11
    times = [t for _, t in frames]
    assert times == sorted(times)
    assert 1.95 <= times[0] <= 2.25 and times[-1] <= 4.05
    assert all(p.stat().st_size > 0 for p, _ in frames)


def test_sha256(synthetic_mp4):
    assert len(media.sha256_file(synthetic_mp4)) == 64
