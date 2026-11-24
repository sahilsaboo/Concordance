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


LABEL = """<document xmlns="urn:hl7-org:v3"><component><section><text>
In the trial with tablets, frequency was similar to those listed in Table 3.
<table><thead><tr><th></th><th>Placebo (N=10) %</th><th>DRUG 15 mg (N=12) %</th></tr></thead>
<tbody><tr><td>Nausea</td><td>8</td><td>28</td></tr><tr><td>Diarrheaa</td><td>8</td><td>23</td></tr>
<tr><td>Vomiting</td><td>2</td><td>13</td></tr></tbody></table></text></section></component></document>"""


def label_claim(**over):
    c = {"id": "c_9", "source_id": "lbl_x", "effect": {"metric": "gi_excess_pp_vs_placebo", "value": 15.3},
         "derivation": {"kind": "label_rows", "table": "Table 1", "placebo_col": "Placebo(N=10)%",
                        "drug_col": "DRUG 15 mg (N=12) %", "rows": {"Nausea": [8, 28], "Diarrhea": [8, 23], "Vomiting": [2, 13]}}}
    c.update(over)
    return c


def run_label(c):
    return bm.verify([c], {"lbl_x": {"setid": "s"}}, fetch_lbl=lambda setid: LABEL)


def test_label_rows_match_cells_headers_and_footnote_markers():
    assert run_label(label_claim()) == []


def test_label_rows_catch_wrong_cell_wrong_column_and_bad_mean():
    wrong_cell = label_claim(derivation={**label_claim()["derivation"], "rows": {"Nausea": [8, 29], "Diarrhea": [8, 23], "Vomiting": [2, 13]}},
                             effect={"metric": "gi_excess_pp_vs_placebo", "value": 15.7})
    assert any("Nausea" in e for e in run_label(wrong_cell))
    assert any("no label table" in e for e in run_label(label_claim(derivation={**label_claim()["derivation"], "drug_col": "DRUG 10 mg"})))
    assert any("does not match" in e for e in run_label(label_claim(effect={"metric": "gi_excess_pp_vs_placebo", "value": 16.0})))


def test_label_quote_must_be_in_label_text():
    assert run_label(label_claim(quotes=["frequency was similar to those listed in Table 3."])) == []
    assert run_label(label_claim(quotes=["rates were identical"]))


def test_gi_scale_is_fixed_and_inverted():
    f = bm.SCALES["gi_excess_pp_vs_placebo"]
    assert (f(0), f(15), f(30), f(40)) == (1, 0.5, 0, 0)


def test_label_claims_use_their_own_ratings_and_label_source():
    sample = json.loads((DATA / "sample_matrix.json").read_text())
    doc = {"label_sources": [{"id": "lbl_x", "setid": "s", "title": "X label", "url": "https://dailymed.nlm.nih.gov/x",
                              "type": "label", "year": 2026, "funding": "mixed"}],
           "claims": [{**label_claim(), "option": "tirzepatide_injection", "dimension": "gi_tolerability", "statement": "s",
                       "ratings": {"bias": 0.5, "thoroughness": 0.75, "rationale": "r", "rater": "llm", "rubric_version": "0.1"},
                       "review": {"status": "approved"}}]}
    m, _ = bm.build(doc, [], sample)
    c = m["claims"][0]
    assert c["ratings"]["thoroughness"] == 0.75 and c["source_id"] == "lbl_x"
    assert c["effect"]["normalized"] == pytest.approx(1 - 15.3 / 30)


def test_convenience_and_cost_rules():
    s = lambda w, inj=False, food=False: bm.convenience_score({"per_week": w, "daily_injection": inj, "food_rule": food})
    assert (s(1), s(7), s(7, inj=True), s(7, food=True)) == (1.0, 0.6, 0.4, 0.4)
    assert (bm.cost_score(0), bm.cost_score(750), bm.cost_score(2000)) == (1.0, 0.5, 0.0)


FACTS = {"sources": [{"id": "px", "kind": "page", "title": "P", "url": "https://example.com/p", "type": "price", "year": 2026, "funding": "manufacturer"}],
         "facts": [{"id": "f_1", "option": "tirzepatide_injection", "dimension": "cost", "kind": "monthly_price_usd",
                    "value": 1349.02, "source_id": "px", "as_of": "2026-11-24", "quotes": ["WAC Price $1,349.02"],
                    "review": {"status": "approved"}}]}
PAGE = "<html><script>var x='$9';</script><p>5-Pen Package <b>WAC Price</b> $1,349.02</p></html>"


def test_verify_facts_checks_quote_and_price():
    assert bm.verify_facts(FACTS, {}, fetch_pg=lambda url: PAGE) == []
    wrong = copy.deepcopy(FACTS)
    wrong["facts"][0]["value"] = 1349
    assert any("not in its quotes" in e for e in bm.verify_facts(wrong, {}, fetch_pg=lambda url: PAGE))
    assert any("quote not found" in e for e in bm.verify_facts(FACTS, {}, fetch_pg=lambda url: "<p>$1,349.02</p>"))
    def blocked(url):
        raise RuntimeError("403")
    assert any("could not fetch" in e for e in bm.verify_facts(FACTS, {}, fetch_pg=blocked))


def test_approved_facts_replace_placeholders_only_where_covered():
    sample = json.loads((DATA / "sample_matrix.json").read_text())
    m, log = bm.build({"claims": []}, [], sample, FACTS)
    tirz_cost = [f for f in m["facts"] if f["option"] == "tirzepatide_injection" and f["dimension"] == "cost"]
    assert [f["id"] for f in tirz_cost] == ["f_1"] and tirz_cost[0]["normalized"] == bm.cost_score(1349.02)
    assert any(f["id"].startswith("f_sample") for f in m["facts"]) and m["meta"]["is_sample"] is True
    pending = copy.deepcopy(FACTS)
    pending["facts"][0]["review"]["status"] = "pending"
    m2, _ = bm.build({"claims": []}, [], sample, pending)
    assert not any(f["id"] == "f_1" for f in m2["facts"])


def test_number_match_accepts_trailing_zeros_only():
    assert bm._num_in(0.8, "(hazard ratio, 0.80; 95% CI") and bm._num_in(1, "1.0 mg")
    assert not bm._num_in(0.8, "0.81") and not bm._num_in(0.8, "10.80")


REG = {"resultsSection": {"adverseEventsModule": {"eventGroups": [
    {"id": "EG000", "seriousNumAffected": 230, "seriousNumAtRisk": 1524}, {"id": "EG001", "seriousNumAffected": 96, "seriousNumAtRisk": 755},
    {"id": "EG002", "seriousNumAffected": 59, "seriousNumAtRisk": 957}, {"id": "EG003", "seriousNumAffected": 19, "seriousNumAtRisk": 487}]}}}


def reg_claim(**d):
    der = {"kind": "ctgov_counts", "nct": "NCT1", "drug_groups": ["EG000", "EG002"], "placebo_groups": ["EG001", "EG003"],
           "drug": [289, 2481], "placebo": [115, 1242], **d}
    return {"id": "c_r", "effect": {"metric": "sae_excess_pp_vs_placebo", "value": 2.4}, "derivation": der}


def test_registry_counts_sum_arms_and_catch_mismatches():
    run = lambda c: bm.verify([c], {}, fetch_reg=lambda nct: REG)
    assert run(reg_claim()) == []
    assert any("!= registry" in e for e in run(reg_claim(drug=[290, 2481])))
    assert any("missing" in e for e in run(reg_claim(placebo_groups=["EG009"])))
    bad_math = reg_claim()
    bad_math["effect"]["value"] = 3.0
    assert any("does not match counts" in e for e in bm.check_derivation(bad_math))


def test_label_pairs_need_numbers_in_quotes_and_correct_sum():
    c = {"id": "c_p", "effect": {"metric": "gallbladder_excess_pp_vs_placebo", "value": 1.3},
         "derivation": {"kind": "label_pairs", "pairs": [[1.6, 0.7], [0.6, 0.2]]},
         "quotes": ["reported by 1.6% vs 0.7% of placebo", "Cholecystitis 0.6% and 0.2%"]}
    assert bm.check_derivation(c) == []
    assert any("not found" in e for e in bm.check_derivation({**c, "quotes": ["1.6% vs 0.7%"]}))
    assert any("does not match" in e for e in bm.check_derivation({**c, "effect": {**c["effect"], "value": 1.5}}))


def test_new_scales_and_severity():
    s = bm.SCALES
    assert (s["mace_hr_vs_placebo"](1.0), s["mace_hr_vs_placebo"](0.8), s["mace_hr_vs_placebo"](0.7), s["mace_hr_vs_placebo"](1.3)) == (0.5, pytest.approx(0.9), 1, 0)
    assert (s["sae_excess_pp_vs_placebo"](-4), s["sae_excess_pp_vs_placebo"](2.5)) == (1, 0.5)
    assert bm.SEVERITY["sae_excess_pp_vs_placebo"] > bm.SEVERITY["gallbladder_excess_pp_vs_placebo"] > bm.SEVERITY["discontinuation_ae_excess_pp_vs_placebo"]


def test_built_claims_carry_severity_and_registry_source():
    sample = json.loads((DATA / "sample_matrix.json").read_text())
    c = {**reg_claim(), "option": "liraglutide_injection", "dimension": "serious_ae_risk", "study_id": "st_1", "statement": "s",
         "registry_source": {"id": "ctgov_NCT1", "title": "Registry", "url": "https://clinicaltrials.gov/study/NCT1?tab=results"},
         "review": {"status": "approved"}}
    m, _ = bm.build({"claims": [c]}, [STUDY], sample)
    out = m["claims"][0]
    assert out["severity"] == 3 and out["source_id"] == "ctgov_NCT1"
    assert out["ratings"]["bias"] == STUDY["source_bias_score"]
