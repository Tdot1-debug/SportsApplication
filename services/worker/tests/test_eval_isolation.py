"""The evaluation harness must not expose labels or original file names to inference."""

import json
import shutil

from smarvii_worker import eval as ev
from smarvii_worker.analysis.adapter import ProviderResponse


class Spy:
    name = "spy-test"
    model = "spy"

    def __init__(self):
        self.seen = []

    def analyse_window(self, req):
        self.seen.append(req)
        return ProviderResponse(
            text=json.dumps({"activity_segments": [], "events": [], "observations": [], "abstentions": [], "limitations": []}),
            stop_reason="end_turn",
            usage={},
            model="spy",
        )


def test_predict_renames_fixture_and_sends_no_labels(cfg, synthetic_mp4, tmp_path):
    named = tmp_path / "7_reps_expected_hinge.MP4"
    shutil.copy(synthetic_mp4, named)
    spy = Spy()
    (tmp_path / "raw").mkdir()
    pred = ev.predict({"id": "x", "drill_template": "gym_test", "excerpt": None}, named, cfg, spy, 1, tmp_path / "raw")
    assert pred["predicted_count"] == 0
    for req in spy.seen:
        assert req.context == {}
        assert all("7_reps" not in str(f.path) for f in req.frames)
        assert "7_reps" not in json.dumps({"ctx": req.context, "excerpt": req.excerpt})


def test_labels_read_only_after_predictions(monkeypatch, tmp_path, synthetic_mp4, cfg):
    vids = tmp_path / "v"
    vids.mkdir()
    shutil.copy(synthetic_mp4, vids / "a.mp4")
    manifest = tmp_path / "m.json"
    manifest.write_text(json.dumps({"fixtures": [{"id": "a", "filename": "a.mp4", "drill_template": "gym_test", "excerpt": None}]}))
    labels = tmp_path / "l.json"
    labels.write_text(json.dumps({"fixtures": {"a": {"expected_count": 3}}}))
    order = []
    real_load = ev._load_json
    monkeypatch.setattr(ev, "_load_json", lambda p: (order.append(("load", p.name)), real_load(p))[1])
    real_predict = ev.predict
    monkeypatch.setattr(ev, "predict", lambda *a: (order.append(("predict", None)), real_predict(*a))[1])
    monkeypatch.setattr(ev, "make_adapter", lambda c: Spy())
    monkeypatch.setenv("SMARVII_TEST_MODE", "1")
    monkeypatch.setenv("ANALYSIS_PROVIDER", "mock")
    rc = ev.main(["--videos-dir", str(vids), "--manifest", str(manifest), "--labels", str(labels), "--out", str(tmp_path / "o")])
    assert rc == 0
    assert order.index(("load", "l.json")) > max(i for i, o in enumerate(order) if o[0] == "predict")
    report = next((tmp_path / "o").glob("*/report.json"))
    row = json.loads(report.read_text())["rows"][0]
    assert row["expected_count"] == 3 and row["predicted_count"] == 0 and row["exact"] is False
