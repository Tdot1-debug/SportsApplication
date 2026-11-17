from smarvii_worker.analysis.windows import Candidate, dedupe, plan_windows
from smarvii_worker.config import SamplingConfig

GYM = SamplingConfig(fps=4.0, window_s=12.0, overlap_s=3.0, max_frames_per_request=48, long_edge_px=768)
BALL = SamplingConfig(fps=10.0, window_s=4.8, overlap_s=1.2, max_frames_per_request=48, long_edge_px=768)


def test_single_window_for_short_range():
    wins, fps = plan_windows(0, 10, GYM)
    assert len(wins) == 1 and (wins[0].start_s, wins[0].end_s) == (0, 10) and fps == 4.0


def test_windows_cover_range_with_overlap():
    for sampling, total in ((GYM, 25.14), (GYM, 60.0), (BALL, 13.77), (BALL, 60.0)):
        wins, fps = plan_windows(0, total, sampling)
        assert wins[0].start_s == 0 and wins[-1].end_s == round(total, 3)
        for a, b in zip(wins, wins[1:], strict=False):
            assert b.start_s < a.end_s, "windows must overlap"
        assert all((w.end_s - w.start_s) * fps <= sampling.max_frames_per_request + 1e-6 for w in wins)


def test_fps_capped_by_source():
    _, fps = plan_windows(0, 10, BALL, source_fps=5.0)
    assert fps == 5.0


def cand(s, e, win, ws, we, typ="rep", trunc=False, label="hinge"):
    return Candidate(s, e, typ, label, "clear", None, None, "ev", win, ws, we, trunc)


def test_dedupe_merges_overlap_duplicates_and_keeps_distinct():
    # Two windows [0,12] and [9,21]; rep at ~10s seen in both; reps at 3s and 15s seen once.
    cands = [cand(2.5, 4.0, 0, 0, 12), cand(9.8, 11.5, 0, 0, 12), cand(9.9, 11.4, 1, 9, 21), cand(14.5, 16.0, 1, 9, 21)]
    out = dedupe(cands, 0, 21)
    assert len(out) == 3
    assert out[1].source_windows == [0, 1]


def test_dedupe_prefers_complete_over_truncated():
    a = cand(11.0, 12.0, 0, 0, 12, trunc=True)
    b = cand(11.0, 12.9, 1, 9, 21)
    out = dedupe([a, b], 0, 21)
    assert len(out) == 1 and out[0].end_s == 12.9 and not out[0].truncated


def test_adjacent_fast_reps_not_merged():
    out = dedupe([cand(1.0, 2.0, 0, 0, 12), cand(2.1, 3.1, 0, 0, 12)], 0, 12)
    assert len(out) == 2


def test_different_types_not_merged_and_clipped():
    out = dedupe([cand(-0.5, 1.0, 0, 0, 12, typ="setup", label="setup"), cand(0.2, 1.1, 0, 0, 12)], 0, 12)
    assert len(out) == 2
    assert min(c.start_s for c in out) == 0
