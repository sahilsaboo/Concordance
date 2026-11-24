import copy
import json
from pathlib import Path

import pytest

from concordance_pipeline import build_matrix as bm

DATA = Path(__file__).resolve().parents[2] / "data"


def claim(**over):
    c = {
        "id": "c_1", "option": "tirzepatide_injection", "dimension": "weight_loss", "study_id": "st_1", "pmid": "1",
        "statement": "s", "effect": {"metric": "pct_weight_change_vs_placebo", "value": -17.8, "timepoint_weeks": 72},
        "derivation": {"kind": "arm_difference", "drug": -20.9, "placebo": -3.1},
        "quotes": ["-20.9% with 15-mg doses and -3.1% with placebo"],
        "review": {"status": "approved", "reviewer": None, "notes": None},
    }
    c.update(over)
    return c


STUDY = {"id": "st_1", "title": "T", "url": "https://pubmed.ncbi.nlm.nih.gov/1/", "design": "rct_double_blind",
         "year": 2022, "funder": "Eli Lilly", "source_bias_score": 0.4, "quality_score": 0.9,
         "source_bias_rationale": "b", "quality_rationale": "q", "rater": "llm", "review": {"status": "approved"}}


def test_derivation_recomputes_and_finds_inputs_in_quotes():
    assert bm.check_derivation(claim()) == []
    assert any("does not match" in e for e in bm.check_derivation(claim(effect={**claim()["effect"], "value": -18.0})))
    assert any("not found" in e for e in bm.check_derivation(claim(quotes=["-20.9% vs placebo"])))


def test_number_match_does_not_accept_a_longer_number():
    assert bm._num_in(-12.4, "difference of -12.4 points")
    assert not bm._num_in(2.4, "difference of -12.4 points")


def test_verify_flags_quote_missing_from_abstract():
    errs = bm.verify([claim()], fetch=lambda pmid: "Results: -20.9% with 15-mg\n doses and -3.1% with placebo.")
    assert errs == []
    assert bm.verify([claim()], fetch=lambda pmid: "something else")


def test_build_inherits_study_ratings_normalizes_and_skips_unapproved():
    sample = json.loads((DATA / "sample_matrix.json").read_text())
    rejected = {**copy.deepcopy(STUDY), "id": "st_2", "review": {"status": "rejected"}}
    doc = {"claims": [claim(), claim(id="c_2", study_id="st_2")]}
    m, log = bm.build(doc, [STUDY, rejected], sample)
    assert [c["id"] for c in m["claims"]] == ["c_1"]
    c = m["claims"][0]
    assert (c["ratings"]["bias"], c["ratings"]["thoroughness"]) == (0.4, 0.9)
    assert c["effect"]["normalized"] == pytest.approx(0.89)
    assert any("st_2" in line for line in log)
    assert {"id": "st_1", "funding": "manufacturer", "type": "rct"}.items() <= next(s for s in m["sources"] if s["id"] == "st_1").items()
    assert m["meta"]["is_sample"] is True  # placeholder facts remain


def test_weight_scale_is_fixed_and_clamped():
    f = bm.SCALES["pct_weight_change_vs_placebo"]
    assert (f(0), f(-10), f(-25), f(3)) == (0, 0.5, 1, 0)


def test_real_claims_draft_derivations_are_consistent():
    doc = json.loads((DATA / "claims_draft.json").read_text())
    assert [e for c in doc["claims"] for e in bm.check_derivation(c)] == []
