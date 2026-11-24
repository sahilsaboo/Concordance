import json

import pytest

from concordance_pipeline import studies


@pytest.fixture
def tmp_data(tmp_path, monkeypatch):
    monkeypatch.setattr(studies, "DRAFT", tmp_path / "draft.json")
    monkeypatch.setattr(studies, "CSV_OUT", tmp_path / "draft.csv")
    src = tmp_path / "src"
    src.mkdir()
    a = {"pmid": "1", "title": "A", "trial_name": "A", "quality_score": 0.9, "source_bias_score": 0.4}
    dup = {"pmid": "1", "title": "A again"}
    b = {"pmid": "2", "title": "B", "trial_name": "B", "quality_score": 0.5, "source_bias_score": 0.8}
    (src / "tirzepatide.json").write_text(json.dumps([a, dup]))
    (src / "independent_realworld.json").write_text(json.dumps([b]))
    return src


def test_build_dedups_and_assigns_ids(tmp_data):
    log = studies.build(tmp_data)
    draft = json.loads(studies.DRAFT.read_text())
    assert [s["trial_name"] for s in draft["studies"]] == ["A", "B"]
    assert [s["id"] for s in draft["studies"]] == ["st_001", "st_002"]
    assert any("duplicate" in line for line in log)
    assert draft["studies"][0]["review"]["status"] == "pending"


def test_key_normalizes_doi_and_title():
    a = {"doi": "https://doi.org/10.1056/NEJMoa1"}
    b = {"doi": "10.1056/nejmoa1"}
    assert studies._key(a) == studies._key(b)
    assert studies._key({"title": "Semaglutide, Once-Weekly."}) == studies._key({"title": "semaglutide once weekly"})


def test_audit_flags_same_trial_not_lookalike_titles():
    rows = [
        {"id": "st_001", "trial_name": "SURMOUNT-1", "title": "Tirzepatide Once Weekly for the Treatment of Obesity."},
        {"id": "st_002", "trial_name": "SURMOUNT-1 (3-year prediabetes cohort)", "title": "Tirzepatide for Obesity Treatment and Diabetes Prevention."},
        {"id": "st_003", "trial_name": "SUSTAIN-6", "title": "Semaglutide and Cardiovascular Outcomes in Patients with Type 2 Diabetes.", "notes": "NCT01720446"},
        {"id": "st_004", "trial_name": "PIONEER 6", "title": "Oral Semaglutide and Cardiovascular Outcomes in Patients with Type 2 Diabetes."},
        {"id": "st_005", "trial_name": None, "title": "Kidney outcomes", "notes": "secondary analysis, NCT01720446"},
    ]
    pairs = {(a, b) for a, b, _ in studies.audit(rows)}
    assert pairs == {("st_001", "st_002"), ("st_003", "st_005")}


def test_sync_changes_only_editable_fields(tmp_data):
    studies.build(tmp_data)
    edit = {"id": "st_001", "source_bias_score": 0.3, "title": "tampered", "review": {"status": "edited"}}
    log = studies.sync([edit, {"id": "st_999"}])
    s = json.loads(studies.DRAFT.read_text())["studies"][0]
    assert s["source_bias_score"] == 0.3
    assert s["review"]["status"] == "edited"
    assert s["title"] == "A"  # citation fields are not editable
    assert any("unknown id" in line for line in log)
    assert "edited" in studies.CSV_OUT.read_text()
