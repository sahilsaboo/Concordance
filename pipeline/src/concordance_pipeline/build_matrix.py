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
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

from .schema import ClaimMatrix

DATA = Path(__file__).resolve().parents[3] / "data"
CACHE = Path(__file__).resolve().parents[2] / ".cache" / "abstracts"
USABLE = {"approved", "edited"}

# Fixed scales (not min-max across options), so a score means the same thing as evidence is added.
# weight_loss: 0 percentage points more than placebo -> 0, 20 or more -> 1.
# gi_tolerability: average excess of nausea, diarrhea, vomiting vs placebo; 0 points -> 1, 30 or more -> 0.
SCALES = {
    "pct_weight_change_vs_placebo": lambda v: max(0.0, min(1.0, -v / 20.0)),
    "gi_excess_pp_vs_placebo": lambda v: max(0.0, min(1.0, 1 - v / 30.0)),
}
LABEL_CACHE = CACHE.parent / "labels"

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
    q, d, v = " ".join(c.get("quotes", [])), c["derivation"], c["effect"]["value"]
    errs = []
    if d["kind"] == "label_rows":
        # Average excess incidence (drug minus placebo) across the rows; cells are checked against the label in verify().
        expected = round(sum(drug - pbo for pbo, drug in d["rows"].values()) / len(d["rows"]), 1)
        return [] if abs(expected - v) < 1e-9 else [f"{c['id']}: value {v} does not match label rows ({expected})"]
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


def fetch_label(setid: str) -> str:
    LABEL_CACHE.mkdir(parents=True, exist_ok=True)
    path = LABEL_CACHE / f"{setid}.xml"
    if not path.exists():
        url = f"https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/{setid}.xml"
        with urllib.request.urlopen(url, timeout=60) as r:
            path.write_bytes(r.read())
    return path.read_text()


def _cell(text: str) -> str:
    return re.sub(r"\s+", "", text)


def _as_float(text: str) -> float | None:
    try:
        return float(text)
    except ValueError:
        return None


def label_tables(xml: str) -> list[list[list[str]]]:
    """Every table in an SPL label as rows of cell text."""
    v3 = "{urn:hl7-org:v3}"
    root = ET.fromstring(xml)
    text = lambda e: _squash("".join(e.itertext()))
    return [[[text(c) for c in tr if c.tag in (v3 + "td", v3 + "th")] for tr in t.iter(v3 + "tr")]
            for t in root.iter(v3 + "table")]


def check_label_rows(c: dict, xml: str) -> list[str]:
    """The claim's placebo and drug cells must sit in one label table under the stated column headers.

    Row names may carry a one-letter footnote marker in the label (e.g. 'Diarrheaa')."""
    d = c["derivation"]
    for rows in label_tables(xml):
        header = next((r for r in rows if _cell(d["placebo_col"]) in map(_cell, r) and _cell(d["drug_col"]) in map(_cell, r)), None)
        if header is None:
            continue
        ip, idr = [list(map(_cell, header)).index(_cell(x)) for x in (d["placebo_col"], d["drug_col"])]
        missing = []
        for name, (pbo, drug) in d["rows"].items():
            ok = any(r and re.fullmatch(rf"{name}[a-z]?", r[0]) and len(r) > max(ip, idr)
                     and _as_float(r[ip]) == pbo and _as_float(r[idr]) == drug for r in rows)
            if not ok:
                missing.append(name)
        return [f"{c['id']}: label row not matched: {m}" for m in missing]
    return [f"{c['id']}: no label table with columns {d['placebo_col']!r} and {d['drug_col']!r}"]


def verify(claims: list[dict], sources: dict[str, dict] | None = None, fetch=fetch_abstract, fetch_lbl=fetch_label) -> list[str]:
    """Study claims: every quote appears verbatim (whitespace-insensitive) in the PubMed abstract.
    Label claims: every table cell matches the DailyMed label, and any quote appears in the label text."""
    errs = []
    for c in claims:
        errs += check_derivation(c)
        if c["derivation"]["kind"] == "label_rows":
            xml = fetch_lbl(sources[c["source_id"]]["setid"])
            errs += check_label_rows(c, xml)
            body = _squash("".join(ET.fromstring(xml).itertext()))
            errs += [f"{c['id']}: quote not in label: {q!r}" for q in c.get("quotes", []) if _squash(q) not in body]
            continue
        abstract = _squash(fetch(c["pmid"]))
        errs += [f"{c['id']}: quote not in PMID {c['pmid']}: {q!r}" for q in c["quotes"] if _squash(q) not in abstract]
    return errs


def source_from_study(s: dict) -> dict:
    funder = s.get("funder") or ""
    funding = "unknown" if not funder else ("manufacturer" if MANUFACTURERS.search(funder) else "independent")
    return {"id": s["id"], "title": s["title"], "url": s["url"], "type": SOURCE_TYPE.get(s["design"], "other"),
            "year": s["year"], "funding": funding}


def _evidence_note(claims: list[dict], sources: dict[str, dict]) -> str:
    """Which priorities use real evidence, and of what kind, e.g. 'Weight loss scores come from reviewed trials...'."""
    kinds: dict[str, set[str]] = {}
    for c in claims:
        if c["review"]["status"] in USABLE:
            kind = "FDA labels" if sources[c["source_id"]]["type"] == "label" else "reviewed trials"
            kinds.setdefault(kind, set()).add(DIM_NAMES.get(c["dimension"], c["dimension"]))
    if not kinds:
        return "No priority uses reviewed evidence yet."
    ordered = sorted(kinds.items(), key=lambda kv: kv[0] != "reviewed trials")
    return " ".join(f"Scores for {' and '.join(sorted(dims))} come from {kind}." for kind, dims in ordered)


def build(claims_doc: dict, studies: list[dict], sample: dict) -> tuple[dict, list[str]]:
    by_id = {s["id"]: s for s in studies}
    labels = {x["id"]: x for x in claims_doc.get("label_sources", [])}
    log, claims, sources = [], [], {}
    for c in claims_doc["claims"]:
        if "study_id" in c:
            # Study claim: inherits the reviewed study's ratings and is dropped if the study wasn't approved.
            s = by_id.get(c["study_id"])
            if s is None or (s.get("review") or {}).get("status") not in USABLE:
                log.append(f"{c['id']}: skipped, study {c['study_id']} is not approved")
                continue
            source = source_from_study(s)
            ratings = {"bias": s["source_bias_score"], "thoroughness": s["quality_score"],
                       "rationale": f"Bias: {s['source_bias_rationale']} Quality: {s['quality_rationale']}",
                       "rater": s.get("rater", "llm"), "rubric_version": "0.1"}
        else:
            # Label claim: rated on the claim itself, since labels are not in the reviewed study list.
            lbl = labels[c["source_id"]]
            source = {k: lbl[k] for k in ("id", "title", "url", "type", "year", "funding")}
            ratings = c["ratings"]
        sources[source["id"]] = source
        claims.append({
            "id": c["id"], "option": c["option"], "dimension": c["dimension"], "statement": c["statement"],
            "effect": {**c["effect"], "normalized": round(SCALES[c["effect"]["metric"]](c["effect"]["value"]), 4)},
            "source_id": source["id"], "ratings": ratings, "review": c["review"],
        })
    # Placeholder facts (price, dosing) and their sample sources, until real ones are collected.
    facts = sample["facts"]
    sources.update({x["id"]: x for x in sample["sources"] if any(f["source_id"] == x["id"] for f in facts)})
    matrix = {
        "meta": {
            "schema_version": sample["meta"]["schema_version"], "rubric_version": "0.1",
            "generated_at": date.today().isoformat(), "is_sample": bool(facts),
            "note": (_evidence_note(claims, sources) + " Cost and convenience still use placeholder numbers, and other "
                     "priorities have no reviewed evidence yet. Don't use these results to make health decisions.")
                    if facts else None,
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
        errs = verify(claims_doc["claims"], {x["id"]: x for x in claims_doc.get("label_sources", [])})
        print("\n".join(errs) or f"all {len(claims_doc['claims'])} claims verified against PubMed and DailyMed")
        sys.exit(1 if errs else 0)
    errs = [e for c in claims_doc["claims"] for e in check_derivation(c)]
    if errs:
        sys.exit("\n".join(errs))
    matrix, log = build(claims_doc, _load("glp1_studies_draft.json")["studies"], _load("sample_matrix.json"))
    (DATA / "claim_matrix.json").write_text(json.dumps(matrix, indent=2, ensure_ascii=False) + "\n")
    usable = sum(c["review"]["status"] in USABLE for c in matrix["claims"])
    print("\n".join(log + [f"wrote data/claim_matrix.json: {len(matrix['claims'])} claims ({usable} approved)"]))
