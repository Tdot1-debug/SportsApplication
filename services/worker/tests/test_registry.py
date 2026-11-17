import json
from pathlib import Path

from smarvii_worker import registry

ROOT = Path(__file__).resolve().parents[3]


def test_packaged_copy_matches_repo_source():
    src = ROOT / "registry" / "capabilities.v1.json"
    packaged = Path(registry.__file__).with_name("capabilities.v1.json")
    assert json.loads(packaged.read_text()) == json.loads(src.read_text()), "run `node registry/sync.mjs`"


def test_every_drill_template_maps_to_one_activity():
    templates = [a["drill_template"] for a in registry.registry()["activities"] if a["drill_template"]]
    assert sorted(templates) == sorted({"gym_test", "general_movement", "softball_hitting", "softball_pitching", "other"})


def test_only_experimental_or_validated_activities_are_analysed():
    assert registry.can_analyse("gym_test")
    assert registry.can_analyse("softball_hitting")
    assert not registry.can_analyse("other")
    assert not registry.can_analyse("tennis_strokes")


def test_no_measurement_is_offered_without_validation():
    # A number with a unit derived from video must be validated before it can be shown.
    for a in registry.registry()["activities"]:
        for m in a["metrics"]:
            if m["kind"] == "measurement":
                assert m["status"] == "validated", f"{a['id']}.{m['id']}"


def test_sources_cited_exist_and_have_access_dates():
    reg = registry.registry()
    ids = {s["id"] for s in reg["sources"]}
    for s in reg["sources"]:
        assert s["accessed"] and s["url"].startswith("https://")
    for a in reg["activities"]:
        for item in a["metrics"] + a["not_available"]:
            assert set(item["sources"]) <= ids, item


def test_run_record_names_version_and_activity():
    rec = registry.run_record("gym_test")
    assert rec == {"version": registry.registry_version(), "activity_id": "strength.reps", "activity_status": "experimental"}
