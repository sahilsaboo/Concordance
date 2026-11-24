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
import subprocess
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
_clamp = lambda x: max(0.0, min(1.0, x))
SCALES = {
    "pct_weight_change_vs_placebo": lambda v: _clamp(-v / 20.0),
    "gi_excess_pp_vs_placebo": lambda v: _clamp(1 - v / 30.0),
    # cardiovascular: hazard ratio for major heart events vs placebo. 1.0 (no effect) -> 0.5, 0.75 or lower -> 1.
    "mace_hr_vs_placebo": lambda hr: _clamp(0.5 + (1 - hr) * 2),
    # serious_ae_risk components: extra percentage points vs placebo; no excess (or fewer than placebo) -> 1.
    "sae_excess_pp_vs_placebo": lambda v: _clamp(1 - v / 5.0),
    "gallbladder_excess_pp_vs_placebo": lambda v: _clamp(1 - v / 3.0),
    "discontinuation_ae_excess_pp_vs_placebo": lambda v: _clamp(1 - v / 10.0),
}
# Severity multiplies a claim's weight in its priority's average (not its confidence).
# Serious adverse events (e.g. hospitalization) > gallbladder disease (often surgery) > stopping treatment.
SEVERITY = {"sae_excess_pp_vs_placebo": 3, "gallbladder_excess_pp_vs_placebo": 2, "discontinuation_ae_excess_pp_vs_placebo": 1}
CTGOV_CACHE = CACHE.parent / "ctgov"
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
    """True if the number appears in the text as written (e.g. -12.4, 106.2; 0.8 also matches "0.80")."""
    digits = f"{abs(n):g}"
    tail = r"0*" if "." in digits else r"(?:\.0+)?"
    return re.search(rf"(?<![\d.]){re.escape(digits)}{tail}(?![\d])", text) is not None


def check_derivation(c: dict) -> list[str]:
    """Each claim's value must be traceable to numbers inside its own quotes."""
    q, d, v = " ".join(c.get("quotes", [])), c["derivation"], c["effect"]["value"]
    errs = []
    if d["kind"] == "label_rows":
        # Average excess incidence (drug minus placebo) across the rows; cells are checked against the label in verify().
        expected = round(sum(drug - pbo for pbo, drug in d["rows"].values()) / len(d["rows"]), 1)
        return [] if abs(expected - v) < 1e-9 else [f"{c['id']}: value {v} does not match label rows ({expected})"]
    if d["kind"] == "ctgov_counts":
        # Registry counts are checked against ClinicalTrials.gov in verify(); here the arithmetic.
        (da, dr), (pa, pr) = d["drug"], d["placebo"]
        expected = round(100 * (da / dr - pa / pr), 1)
        return [] if abs(expected - v) < 1e-9 else [f"{c['id']}: value {v} does not match counts ({expected})"]
    if d["kind"] == "label_pairs":
        # Sum of (drug % - placebo %) across the quoted pairs, every number taken from the label quotes.
        inputs = [x for pair in d["pairs"] for x in pair]
        expected = round(sum(drug - pbo for drug, pbo in d["pairs"]), 1)
    elif d["kind"] == "reported":
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


def fetch_ctgov(nct: str) -> dict:
    CTGOV_CACHE.mkdir(parents=True, exist_ok=True)
    path = CTGOV_CACHE / f"{nct}.json"
    if not path.exists():
        url = f"https://clinicaltrials.gov/api/v2/studies/{nct}?fields=NCTId,BriefTitle,HasResults,AdverseEventsModule"
        with urllib.request.urlopen(url, timeout=30) as r:
            path.write_bytes(r.read())
    return json.loads(path.read_text())


def check_ctgov_counts(c: dict, record: dict) -> list[str]:
    """Summed serious-event counts for the named arms must equal the registry's results."""
    d = c["derivation"]
    groups = {g["id"]: g for g in record.get("resultsSection", {}).get("adverseEventsModule", {}).get("eventGroups", [])}
    errs = []
    for arm in ("drug", "placebo"):
        ids = d[f"{arm}_groups"]
        if any(i not in groups for i in ids):
            errs.append(f"{c['id']}: {arm} group missing in {d['nct']}")
            continue
        got = [sum(groups[i]["seriousNumAffected"] for i in ids), sum(groups[i]["seriousNumAtRisk"] for i in ids)]
        if got != list(d[arm]):
            errs.append(f"{c['id']}: {arm} counts {d[arm]} != registry {got}")
    return errs


def verify(claims: list[dict], sources: dict[str, dict] | None = None, fetch=fetch_abstract, fetch_lbl=fetch_label,
           fetch_reg=fetch_ctgov) -> list[str]:
    """Study claims: every quote appears verbatim (whitespace-insensitive) in the PubMed abstract.
    Label claims: table cells match the DailyMed label, and any quote appears in the label text.
    Registry claims: serious-event counts match ClinicalTrials.gov results."""
    errs = []
    for c in claims:
        errs += check_derivation(c)
        kind = c["derivation"]["kind"]
        if kind == "ctgov_counts":
            errs += check_ctgov_counts(c, fetch_reg(c["derivation"]["nct"]))
            continue
        if kind in ("label_rows", "label_pairs"):
            xml = fetch_lbl(sources[c["source_id"]]["setid"])
            if kind == "label_rows":
                errs += check_label_rows(c, xml)
            body = _squash("".join(ET.fromstring(xml).itertext()))
            errs += [f"{c['id']}: quote not in label: {q!r}" for q in c.get("quotes", []) if _squash(q) not in body]
            continue
        abstract = _squash(fetch(c["pmid"]))
        errs += [f"{c['id']}: quote not in PMID {c['pmid']}: {q!r}" for q in c["quotes"] if _squash(q) not in abstract]
    return errs


PAGE_CACHE = CACHE.parent / "pages"
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def fetch_page(url: str) -> str:
    """A price page's HTML, cached per URL. Pages change: delete the cache to re-check current prices."""
    PAGE_CACHE.mkdir(parents=True, exist_ok=True)
    path = PAGE_CACHE / (re.sub(r"[^A-Za-z0-9]+", "_", url)[:150] + ".html")
    if not path.exists():
        # curl, not urllib: lilly.com returns 403 to Python's HTTP client but serves the page to curl.
        out = subprocess.run(["curl", "-sSL", "--fail", "--max-time", "30", "-A", BROWSER_UA, url],
                             capture_output=True, check=True)
        path.write_bytes(out.stdout)
    return path.read_text(errors="ignore")


def page_text(html_src: str) -> str:
    """Visible text of an HTML page: scripts and styles removed, tags become spaces, whitespace squashed."""
    import html as htmllib
    body = re.sub(r"<script.*?</script>|<style.*?</style>", "", html_src, flags=re.S | re.I)
    return _squash(htmllib.unescape(re.sub(r"<[^>]+>", " ", body)))


def _price_str(v: float) -> str:
    return f"${v:,.2f}" if v != int(v) else f"${int(v):,}"


# Convenience and cost are scored by stated rules (see facts_draft.json meta), not rated like evidence.
def convenience_score(schedule: dict) -> float:
    base = 1.0 if schedule["per_week"] <= 1 else 0.6
    return round(base - 0.2 * schedule["daily_injection"] - 0.2 * schedule["food_rule"], 4)


def cost_score(monthly_usd: float) -> float:
    return round(max(0.0, min(1.0, 1 - monthly_usd / 1500)), 4)


def verify_facts(facts_doc: dict, label_sources: dict[str, dict], fetch_lbl=fetch_label, fetch_pg=fetch_page) -> list[str]:
    """Every quote must appear in its label or price page, and each price must appear in its own quotes."""
    errs, srcs = [], {s["id"]: s for s in facts_doc["sources"]}
    for f in facts_doc["facts"]:
        s = srcs[f["source_id"]]
        try:
            if s["kind"] == "label":
                text = _squash("".join(ET.fromstring(fetch_lbl(s["setid"])).itertext()))
            else:
                text = page_text(fetch_pg(s["url"]))
        except Exception as e:  # a page that can't be fetched is a failed check, not a crash
            errs.append(f"{f['id']}: could not fetch {f['source_id']}: {e}")
            continue
        errs += [f"{f['id']}: quote not found at {f['source_id']}: {q!r}" for q in f["quotes"] if _squash(q) not in text]
        # Whole-number match, so $1,349 doesn't pass on "$1,349.02".
        if f["kind"] == "monthly_price_usd" and not re.search(
                re.escape(_price_str(f["value"])) + r"(?![\d]|[.,]\d)", " ".join(f["quotes"])):
            errs.append(f"{f['id']}: price {_price_str(f['value'])} is not in its quotes")
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


def real_facts(facts_doc: dict | None, label_sources: dict[str, dict]) -> tuple[list[dict], dict[str, dict]]:
    """Approved price and dosing facts in matrix shape, plus the sources they cite."""
    if not facts_doc:
        return [], {}
    srcs = {s["id"]: s for s in facts_doc["sources"]}
    facts, sources = [], {}
    for f in facts_doc["facts"]:
        if (f.get("review") or {}).get("status") not in USABLE:
            continue
        s = srcs[f["source_id"]]
        meta = label_sources[s["id"]] if s["kind"] == "label" else s
        sources[s["id"]] = {k: meta[k] for k in ("id", "title", "url", "type", "year", "funding")}
        normalized = convenience_score(f["schedule"]) if f["kind"] == "dosing" else cost_score(f["value"])
        facts.append({"id": f["id"], "option": f["option"], "dimension": f["dimension"], "kind": f["kind"],
                      "value": f["value"], "normalized": normalized, "source_id": s["id"], "as_of": f["as_of"]})
    return facts, sources


def build(claims_doc: dict, studies: list[dict], sample: dict, facts_doc: dict | None = None) -> tuple[dict, list[str]]:
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
            if "registry_source" in c:  # numbers come from the trial's registry results, ratings from the study
                source = {**source, **c["registry_source"]}
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
            "severity": SEVERITY.get(c["effect"]["metric"], 1),
            "source_id": source["id"], "ratings": ratings, "review": c["review"],
        })
    # Approved real facts first; sample placeholders only for an option and priority with no approved fact.
    facts, fact_sources = real_facts(facts_doc, labels)
    sources.update(fact_sources)
    covered = {(f["option"], f["dimension"]) for f in facts}
    placeholders = [f for f in sample["facts"] if (f["option"], f["dimension"]) not in covered]
    facts += placeholders
    sources.update({x["id"]: x for x in sample["sources"] if any(f["source_id"] == x["id"] for f in placeholders)})
    if placeholders:
        log.append(f"{len(placeholders)} placeholder facts still in use")
    matrix = {
        "meta": {
            "schema_version": sample["meta"]["schema_version"], "rubric_version": "0.1",
            "generated_at": date.today().isoformat(), "is_sample": bool(placeholders),
            "note": (_evidence_note(claims, sources) + " Some cost or convenience numbers are still placeholders. "
                     "Don't use these results to make health decisions.") if placeholders else None,
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
    facts_doc = _load("facts_draft.json") if (DATA / "facts_draft.json").exists() else None
    labels = {x["id"]: x for x in claims_doc.get("label_sources", [])}
    if cmd == "verify":
        errs = verify(claims_doc["claims"], labels) + (verify_facts(facts_doc, labels) if facts_doc else [])
        n_facts = len(facts_doc["facts"]) if facts_doc else 0
        print("\n".join(errs) or f"all {len(claims_doc['claims'])} claims and {n_facts} facts verified at their sources")
        sys.exit(1 if errs else 0)
    errs = [e for c in claims_doc["claims"] for e in check_derivation(c)]
    if errs:
        sys.exit("\n".join(errs))
    matrix, log = build(claims_doc, _load("glp1_studies_draft.json")["studies"], _load("sample_matrix.json"), facts_doc)
    (DATA / "claim_matrix.json").write_text(json.dumps(matrix, indent=2, ensure_ascii=False) + "\n")
    usable = sum(c["review"]["status"] in USABLE for c in matrix["claims"])
    print("\n".join(log + [f"wrote data/claim_matrix.json: {len(matrix['claims'])} claims ({usable} approved)"]))
