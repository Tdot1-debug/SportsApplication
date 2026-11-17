from smarvii_worker.analysis.schema import banned_claims, json_schema, validate_window


def ev(**kw):
    base = {
        "start_s": 1.0,
        "end_s": 2.0,
        "event_type": "rep",
        "activity_label": "hinge",
        "visibility": "clear",
        "suggested_outcome": "none",
        "abstention_reason": "none",
        "starts_before_window": False,
        "ends_after_window": False,
        "evidence": "Hips move back and return to standing in frames 3-9.",
    }
    return base | kw


def out(**kw):
    return {"activity_segments": [], "events": [], "observations": [], "abstentions": [], "limitations": []} | kw


def test_valid_window_passes():
    parsed, errors = validate_window(out(events=[ev()]), "gym_test", 0.0, 12.0)
    assert errors == [] and parsed is not None and len(parsed.events) == 1


def test_extra_fields_and_nulls_rejected():
    _, errors = validate_window(out(events=[ev(confidence=0.93)]), "gym_test", 0, 12)
    assert errors and "schema" in errors[0]
    _, errors = validate_window(out(events=[ev(suggested_outcome=None)]), "gym_test", 0, 12)
    assert errors


def test_template_specific_outcomes():
    _, errors = validate_window(
        out(events=[ev(event_type="swing", activity_label="swing", suggested_outcome="target_hit")]), "softball_hitting", 0, 5
    )
    assert any("not allowed" in e for e in errors)
    parsed, errors = validate_window(
        out(events=[ev(event_type="swing", activity_label="swing", suggested_outcome="foul")]), "softball_hitting", 0, 5
    )
    assert parsed and not errors
    _, errors = validate_window(
        out(events=[ev(event_type="pitch", activity_label="pitch", suggested_outcome="fair_contact")]), "softball_pitching", 0, 5
    )
    assert errors
    _, errors = validate_window(out(events=[ev(suggested_outcome="fair_contact")]), "gym_test", 0, 12)
    assert errors


def test_event_type_must_match_template():
    _, errors = validate_window(out(events=[ev(event_type="swing")]), "gym_test", 0, 12)
    assert any("event_type" in e for e in errors)


def test_times_must_be_inside_window_and_ordered():
    _, errors = validate_window(out(events=[ev(start_s=20.0, end_s=21.0)]), "gym_test", 0, 12)
    assert any("outside window" in e for e in errors)
    _, errors = validate_window(out(events=[ev(start_s=3.0, end_s=2.0)]), "gym_test", 0, 12)
    assert any("before end" in e for e in errors)


def test_duplicate_events_rejected():
    _, errors = validate_window(out(events=[ev(), ev()]), "gym_test", 0, 12)
    assert any("duplicate" in e for e in errors)


def test_numeric_measurements_rejected():
    assert banned_claims("Bat speed looked like 62 mph and the elbow was at 90 degrees")
    assert banned_claims("Hit rate 75%")
    assert banned_claims("Spin rate was high")
    assert not banned_claims("Frames 3-7 show the stride foot landing before the hands move.")
    obs = {
        "t_start_s": 1,
        "t_end_s": 2,
        "category": "stride",
        "observation": "Stride is 30 inches long",
        "evidence": "frames 4-6",
        "limitations": "",
        "review_questions": [],
    }
    _, errors = validate_window(out(observations=[obs]), "softball_hitting", 0, 5)
    assert any("numeric measurement" in e for e in errors)


def test_abstention_reason_none_rejected():
    _, errors = validate_window(out(abstentions=[{"start_s": 1, "end_s": 2, "reason": "none", "detail": ""}]), "gym_test", 0, 12)
    assert errors


def test_json_schema_is_closed():
    s = json_schema()
    assert s["additionalProperties"] is False
    assert s["properties"]["events"]["items"]["additionalProperties"] is False
    assert "confidence" not in str(s)


def test_general_movement_template_counts_reps_without_outcomes():
    parsed, errors = validate_window(out(events=[ev(activity_label="other_exercise")]), "general_movement", 0, 12)
    assert parsed and not errors
    _, errors = validate_window(out(events=[ev(suggested_outcome="fair_contact")]), "general_movement", 0, 12)
    assert errors
    _, errors = validate_window(out(events=[ev(event_type="swing")]), "general_movement", 0, 12)
    assert errors
