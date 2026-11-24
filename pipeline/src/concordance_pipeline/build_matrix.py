"""Build data/claim_matrix.json, the file the web app reads.

Inputs:
- data/claims_draft.json: claims extracted from studies, each with verbatim abstract quotes.
- data/glp1_studies_draft.json: reviewed studies. A claim inherits its study's ratings
  (bias = source bias score, thoroughness = quality score) and is used only if the study was
  approved or edited.
- data/sample_matrix.json: options and dimensions, plus placeholder facts (price, dosing) until
  real ones are collected. While any placeholder remains, the output is flagged is_sample.

    uv run python -m concordance_pipeline.build_matrix verify   # check quotes against PubMed (network)
    uv run python -m concordance_pipeline.build_matrix build    # write data/claim_matrix.json
"""

import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

from .schema import ClaimMatrix

DATA = Path(__file__).resolve().parents[3] / "data"
CACHE = Path(__file__).resolve().parents[2] / ".cache" / "abstracts"
USABLE = {"approved", "edited"}

# Fixed scales (not min-max across options), so a score means the same thing as evidence is added.
# weight_loss: 0 percentage points vs placebo -> 0, 20 or more -> 1.
SCALES = {"pct_weight_change_vs_placebo": lambda v: max(0.0, min(1.0, -v / 20.0))}

DIM_NAMES = {"weight_loss": "weight loss", "gi_tolerability": "stomach side effects",
             "serious_ae_risk": "serious side-effect risk", "cardiovascular": "heart health"}
MANUFACTURERS = re.compile(r"novo|lilly|astrazeneca|sanofi|amylin|boehringer", re.I)
SOURCE_TYPE = {
    "rct_double_blind": "rct", "rct_open_label": "rct", "cvot": "rct", "post_hoc": "rct",
    "meta_analysis": "meta_analysis", "network_meta_analysis": "meta_analysis",
    "observational_cohort": "observational", "target_trial_emulation": "observational",
    "case_control": "observational", "pharmacovigilance": "observational",
    "hta_report": "hta_report", "regulatory_review": "other",
}


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _num_in(n: float, text: str) -> bool:
    """True if the number appears in the text as written (e.g. -12.4, 106.2)."""
    return re.search(rf"(?<![\d.]){re.escape(f'{abs(n):g}')}(?![\d])", text) is not None


def check_derivation(c: dict) -> list[str]:
    """Each claim's value must be traceable to numbers inside its own quotes."""
    q, d, v = " ".join(c["quotes"]), c["derivation"], c["effect"]["value"]
    errs = []
    if d["kind"] == "reported":
        inputs, expected = [v], v
    elif d["kind"] == "arm_difference":
        inputs, expected = [d["drug"], d["placebo"]], round(d["drug"] - d["placebo"], 1)
    elif d["kind"] == "kg_over_baseline":
        inputs, expected = [d["diff_kg"], d["baseline_kg"]], round(d["diff_kg"] / d["baseline_kg"] * 100, 1)
    else:
        return [f"{c['id']}: unknown derivation {d['kind']!r}"]
    errs += [f"{c['id']}: {n} not found in quotes" for n in inputs if not _num_in(n, q)]
    if abs(expected - v) > 1e-9:
        errs.append(f"{c['id']}: value {v} does not match derivation ({expected})")
    return errs


def fetch_abstract(pmid: str) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{pmid}.txt"
    if not path.exists():
        url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pmid}&rettype=abstract&retmode=text"
        with urllib.request.urlopen(url, timeout=30) as r:
            path.write_bytes(r.read())
    return path.read_text()


def verify(claims: list[dict], fetch=fetch_abstract) -> list[str]:
    """Every quote must appear verbatim (whitespace-insensitive) in the claim's PubMed abstract."""
    errs = []
    for c in claims:
        errs += check_derivation(c)
        abstract = _squash(fetch(c["pmid"]))
        errs += [f"{c['id']}: quote not in PMID {c['pmid']}: {q!r}" for q in c["quotes"] if _squash(q) not in abstract]
    return errs


def source_from_study(s: dict) -> dict:
    funder = s.get("funder") or ""
    funding = "unknown" if not funder else ("manufacturer" if MANUFACTURERS.search(funder) else "independent")
    return {"id": s["id"], "title": s["title"], "url": s["url"], "type": SOURCE_TYPE.get(s["design"], "other"),
            "year": s["year"], "funding": funding}


def build(claims_doc: dict, studies: list[dict], sample: dict) -> tuple[dict, list[str]]:
    by_id = {s["id"]: s for s in studies}
    log, claims, sources = [], [], {}
    for c in claims_doc["claims"]:
        s = by_id.get(c["study_id"])
        if s is None or (s.get("review") or {}).get("status") not in USABLE:
            log.append(f"{c['id']}: skipped, study {c['study_id']} is not approved")
            continue
        sources[s["id"]] = source_from_study(s)
        claims.append({
            "id": c["id"], "option": c["option"], "dimension": c["dimension"], "statement": c["statement"],
            "effect": {**c["effect"], "normalized": round(SCALES[c["effect"]["metric"]](c["effect"]["value"]), 4)},
            "source_id": s["id"],
            "ratings": {"bias": s["source_bias_score"], "thoroughness": s["quality_score"],
                        "rationale": f"Bias: {s['source_bias_rationale']} Quality: {s['quality_rationale']}",
                        "rater": s.get("rater", "llm"), "rubric_version": "0.1"},
            "review": c["review"],
        })
    # Placeholder facts (price, dosing) and their sample sources, until real ones are collected.
    facts = sample["facts"]
    sources.update({x["id"]: x for x in sample["sources"] if any(f["source_id"] == x["id"] for f in facts)})
    claim_dims = sorted({c["dimension"] for c in claims if c["review"]["status"] in USABLE})
    matrix = {
        "meta": {
            "schema_version": sample["meta"]["schema_version"], "rubric_version": "0.1",
            "generated_at": date.today().isoformat(), "is_sample": bool(facts),
            "note": ((f"Scores for {', '.join(DIM_NAMES.get(d, d) for d in claim_dims)} come from reviewed studies. "
                      if claim_dims else "No priority uses reviewed studies yet. ")
                     + "Cost and convenience still use placeholder numbers, and other priorities have no reviewed "
                     "evidence yet. Don't use these results to make health decisions.") if facts else None,
        },
        "dimensions": sample["dimensions"], "options": sample["options"],
        "sources": list(sources.values()), "claims": claims, "facts": facts,
    }
    ClaimMatrix.model_validate(matrix)  # raises on a broken reference or out-of-range score
    return matrix, log


def _load(name: str) -> dict:
    return json.loads((DATA / name).read_text())


if __name__ == "__main__":
    cmd = sys.argv[1]
    claims_doc = _load("claims_draft.json")
    if cmd == "verify":
        errs = verify(claims_doc["claims"])
        print("\n".join(errs) or f"all {len(claims_doc['claims'])} claims verified against PubMed")
        sys.exit(1 if errs else 0)
    errs = [e for c in claims_doc["claims"] for e in check_derivation(c)]
    if errs:
        sys.exit("\n".join(errs))
    matrix, log = build(claims_doc, _load("glp1_studies_draft.json")["studies"], _load("sample_matrix.json"))
    (DATA / "claim_matrix.json").write_text(json.dumps(matrix, indent=2, ensure_ascii=False) + "\n")
    usable = sum(c["review"]["status"] in USABLE for c in matrix["claims"])
    print("\n".join(log + [f"wrote data/claim_matrix.json: {len(matrix['claims'])} claims ({usable} approved)"]))
