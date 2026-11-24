"""GLP-1 study list: build the draft from research output, and merge human review edits back in.

The draft lives in data/glp1_studies_draft.json (source of truth) with a CSV mirror for spreadsheets.
Review happens in the Evidence Review artifact; its edits come back as a JSON list of study records
(from the page's "Download JSON" button, or pulled by Claude from the artifact database).

    uv run python -m concordance_pipeline.studies build <dir with per-group JSON files>
    uv run python -m concordance_pipeline.studies sync <reviewed export .json, or a folder of <id>.json>
    uv run python -m concordance_pipeline.studies audit   # list records that share a trial's participants
"""

import csv
import json
import re
import sys
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parents[3] / "data"
DRAFT = DATA / "glp1_studies_draft.json"
CSV_OUT = DATA / "glp1_studies_draft.csv"
GROUPS = ["semaglutide_injection", "semaglutide_oral", "tirzepatide", "other_agents", "independent_realworld"]

# Fields a reviewer may change in the artifact. Everything else (citation, IDs, design) stays as researched.
EDITABLE = {
    "key_result", "funder", "funder_role", "author_coi", "source_bias_score", "quality_score",
    "source_bias_rationale", "quality_rationale", "notes", "rater", "review",
}
CSV_COLS = [
    "id", "group", "trial_name", "molecule", "route", "brands", "design", "comparator", "n", "duration_weeks",
    "key_result", "funder", "funder_role", "source_bias_score", "source_bias_rationale", "rob2_overall",
    "quality_score", "quality_rationale", "dimensions", "first_author", "journal", "year", "pmid", "doi", "url",
    "verified", "rater", "review_status", "review_notes", "overlaps", "notes",
]


def _norm_doi(doi: str | None) -> str:
    return re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", (doi or "").strip().lower())


def _norm_title(title: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (title or "").lower()).strip()


def _key(s: dict) -> str:
    """Dedup key for one publication: PMID, else normalized DOI, else normalized title."""
    if s.get("pmid"):
        return "pmid:" + str(s["pmid"]).strip()
    if s.get("doi"):
        return "doi:" + _norm_doi(s["doi"])
    return "title:" + _norm_title(s.get("title"))


def _trial_stem(name: str | None) -> str:
    """'SURMOUNT-1 (3-year prediabetes cohort)' -> 'surmount1'."""
    return re.sub(r"[^a-z0-9]", "", (name or "").split("(")[0].lower())


def audit(studies: list[dict]) -> list[tuple[str, str, str]]:
    """Find records that are different papers from the same trial (shared participants).

    Not duplicates to delete, but scoring must not count both for the same outcome.
    Returns (id_a, id_b, reason) for same trial-name stem or same NCT registration.
    """
    out = []
    ncts = {s["id"]: set(re.findall(r"NCT\d{8}", json.dumps(s))) for s in studies}
    for i, a in enumerate(studies):
        for b in studies[i + 1:]:
            stem_a, stem_b = _trial_stem(a.get("trial_name")), _trial_stem(b.get("trial_name"))
            if stem_a and stem_a == stem_b:
                out.append((a["id"], b["id"], f"same trial: {a['trial_name'].split('(')[0].strip()}"))
            elif shared := ncts[a["id"]] & ncts[b["id"]]:
                out.append((a["id"], b["id"], f"same registration: {', '.join(sorted(shared))}"))
    return out


def build(src_dir: Path) -> list[str]:
    """Combine per-group research files into the draft. Returns log lines (missing files, duplicates)."""
    log, studies, seen = [], [], {}
    for group in GROUPS:
        path = src_dir / f"{group}.json"
        if not path.exists():
            log.append(f"missing: {path.name}")
            continue
        for s in json.loads(path.read_text()):
            k = _key(s)
            if k in seen:
                log.append(f"duplicate dropped: {s.get('trial_name') or s.get('title')} ({group}; kept from {seen[k]})")
                continue
            seen[k] = group
            s.update(group=group, rater="llm", review={"status": "pending", "notes": None, "reviewer": None})
            studies.append(s)
    studies.sort(key=lambda s: (GROUPS.index(s["group"]), -(s.get("quality_score") or 0)))
    for i, s in enumerate(studies, 1):
        s["id"] = f"st_{i:03d}"
    for a, b, reason in audit(studies):
        log.append(f"shared participants, kept both: {a} / {b} ({reason})")
    meta = {
        "generated_at": date.today().isoformat(),
        "rubric_version": "0.1",
        "note": "LLM-drafted ratings with drug names visible (not masked). Human review required before use in claim_matrix.json.",
    }
    write(meta, studies)
    return log


def sync(export: list[dict] | dict) -> list[str]:
    """Apply reviewed records to the draft. Only EDITABLE fields change; unknown ids are reported, not added."""
    rows = export["studies"] if isinstance(export, dict) else export
    draft = json.loads(DRAFT.read_text())
    by_id = {s["id"]: s for s in draft["studies"]}
    log = []
    for r in rows:
        target = by_id.get(r.get("id"))
        if target is None:
            log.append(f"unknown id skipped: {r.get('id')}")
            continue
        changed = [k for k in EDITABLE if k in r and r[k] != target.get(k)]
        for k in changed:
            target[k] = r[k]
        if changed:
            log.append(f"{target['id']} {target.get('trial_name') or ''}: {', '.join(sorted(changed))}")
    draft["meta"]["last_synced"] = date.today().isoformat()
    write(draft["meta"], draft["studies"])
    return log


def write(meta: dict, studies: list[dict]) -> None:
    DRAFT.write_text(json.dumps({"meta": meta, "studies": studies}, indent=2, ensure_ascii=False) + "\n")
    with CSV_OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLS, extrasaction="ignore")
        w.writeheader()
        for s in studies:
            review = s.get("review") or {}
            w.writerow({
                **s,
                "brands": "; ".join(s.get("brands") or []),
                "dimensions": "; ".join(s.get("dimensions") or []),
                "rob2_overall": (s.get("rob2") or {}).get("overall"),
                "review_status": review.get("status"),
                "review_notes": review.get("notes"),
                "overlaps": _overlap_summary(s),
            })


def link_syntheses(studies: list[dict], mapping: list[dict]) -> list[str]:
    """Record which primary studies each synthesis (meta-analysis, HTA, regulatory review) pooled.

    `mapping` items: {"synthesis_id", "links": [{"primary_id", "basis": "confirmed"|"likely"}]}.
    Writes `includes` on the synthesis and `included_in` on each primary, replacing earlier links.
    """
    by_id = {s["id"]: s for s in studies}
    for s in studies:
        s.pop("includes", None)
        s.pop("included_in", None)
    log = []
    for m in mapping:
        syn = by_id.get(m["synthesis_id"])
        if syn is None:
            log.append(f"unknown synthesis skipped: {m['synthesis_id']}")
            continue
        for link in m.get("links", []):
            prim = by_id.get(link["primary_id"])
            if prim is None or link.get("basis") not in ("confirmed", "likely"):
                log.append(f"bad link skipped: {m['synthesis_id']} -> {link}")
                continue
            syn.setdefault("includes", []).append({"id": prim["id"], "basis": link["basis"]})
            prim.setdefault("included_in", []).append({"id": syn["id"], "basis": link["basis"]})
    return log


def _overlap_summary(s: dict) -> str:
    parts = [f"same trial: {i}" for i in s.get("same_trial_as") or []]
    parts += [f"pooled in {r['id']} ({r['basis']})" for r in s.get("included_in") or []]
    parts += [f"pools {r['id']} ({r['basis']})" for r in s.get("includes") or []]
    return "; ".join(parts)


def load_export(path: Path) -> list[dict]:
    """Read a reviewed export: the page's downloaded .json, or a folder of one <id>.json per study (a db pull)."""
    if path.is_dir():
        return [{**json.loads(p.read_text()), "id": p.stem} for p in sorted(path.glob("*.json"))]
    return json.loads(path.read_text())


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "audit":
        pairs = audit(json.loads(DRAFT.read_text())["studies"])
        print("\n".join(f"{a} / {b}: {r}" for a, b, r in pairs) or "no shared-trial records")
        sys.exit(0)
    arg = Path(sys.argv[2])
    lines = build(arg) if cmd == "build" else sync(load_export(arg))
    print("\n".join(lines) or "no changes")
    print(f"{len(json.loads(DRAFT.read_text())['studies'])} studies in {DRAFT.relative_to(DATA.parent)}")
