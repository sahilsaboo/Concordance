# Concordance: Development Plan (draft v0.1, 2026-11-23)

Stack: **Next.js (TypeScript) web app + Python evidence pipeline.**

## 1. Architecture

```
sources (FDA labels, ClinicalTrials.gov, PubMed, ICER)
        │
        ▼
[pipeline/  Python]  fetch → extract claims (LLM) → rate claims (LLM, drug names masked)
        │                                   │
        │                          human review (you)
        ▼                                   ▼
[data/claim_matrix.json]  ← the ONLY contract between the two halves
        │
        ▼
[web/  Next.js]  questionnaire → filter + score (pure TS function) → ranked, cited results
```

Design choices:
- **No LLM calls at runtime.** Same answers always give the same ranking, every number traces back to a reviewed claim, and hosting is free or close to it.
- **One JSON file as the interface.** The pipeline and web app can be built and tested independently. The web app can start against a hand-written sample matrix before the pipeline exists.
- **Matrix is versioned in git.** Every ranking change is a diff you can review.

## 2. Repo layout

```
Concordance/
  PLAN.md
  data/
    sources.json          # every cited source + metadata
    claims.json           # every claim + ratings + review status
    claim_matrix.json     # build output consumed by web/
    sample_matrix.json    # hand-written, for building the UI early
  pipeline/               # Python 3.12 (via uv)
    fetch/                # per-source fetchers
    extract.py            # source text → candidate claims
    rate.py               # claim → bias + thoroughness ratings
    review/               # export/import for human review (CSV first)
    build_matrix.py       # claims → claim_matrix.json
    tests/
  web/                    # Next.js App Router, TypeScript, Tailwind
    app/                  # questionnaire, results pages
    lib/scoring.ts        # pure ranking function, unit-tested
```

## 3. Unit of ranking

Rank **molecule + route**, not brand. Brands are revealed under each option on the results page.

Option list (US approval status as of 2026-11-24):

| Option | Brands | Approved for | Notes |
|---|---|---|---|
| semaglutide, injection | Wegovy, Ozempic | Obesity (Wegovy), T2D (Ozempic) | Wegovy label (DailyMed, Jun 2026) includes the 7.2 mg dose and a MASH indication |
| semaglutide, oral | Wegovy pill, Rybelsus | Obesity (Wegovy pill, approved 2025-12-22), T2D (Rybelsus) | Wegovy pill is 25 mg; launched Jan 2026 |
| tirzepatide, injection | Zepbound, Mounjaro | Obesity (Zepbound), T2D (Mounjaro) | |
| liraglutide, injection | Saxenda, Victoza, generics | Obesity (Saxenda), T2D (Victoza) | Generic Victoza (2024) and generic Saxenda (2025-08-28) from Teva |
| **orforglipron, oral (new)** | Foundayo | Obesity (approved 2026-04-01) | Non-peptide pill. T2D filed Q2 2026, not approved yet |

Not included:
- **Dulaglutide (Trulicity):** T2D only, no obesity indication. Add if the treatment-goal question includes T2D.
- **Exenatide:** Bydureon BCise discontinued Oct 2024. Generic twice-daily exenatide (Amneal) is still sold for T2D only.
- **Lixisenatide:** Adlyxin withdrawn Jan 2023. Only sold inside Soliqua (with insulin glargine).
- **Not yet approved:** CagriSema (filed Dec 2025, decision expected Q4 2026), retatrutide (BLA planned Q1 2027), survodutide (filing planned 2027). Recheck CagriSema before launch.
- **Compounded products:** regulatory and quality uncertainty.

Sources: research-agent checks of manufacturer press releases and FDA pages (Nov 2026). The Wegovy pill date is from Novo Nordisk's US release; the FDA label itself was not opened. Brand lists in `data/sample_matrix.json` predate this table.

## 4. Data model

Two kinds of records, rated differently:
- **Claims** (efficacy, side effects, outcomes): come from studies. Rated for bias and thoroughness.
- **Facts** (price, dosing frequency, route, contraindications): come from labels and price sources. Verified and dated, not bias-rated.

```jsonc
// claim
{
  "id": "c_0042",
  "option": "tirzepatide_injection",
  "dimension": "weight_loss",          // maps to a questionnaire priority
  "statement": "Mean body-weight reduction of X% vs placebo at 72 weeks",
  "effect": { "metric": "pct_weight_change_vs_placebo", "value": -0.0, "timepoint_weeks": 72 },
  "source_id": "s_0007",
  "ratings": {
    "bias": 0.0,                        // 0–1, higher = less biased
    "thoroughness": 0.0,                // 0–1
    "rationale": "…",                   // LLM rationale, shown to reviewer
    "rater": "llm",                     // llm | human
    "rubric_version": "0.1"
  },
  "review": { "status": "pending", "reviewer": null, "notes": null }   // pending | approved | edited | rejected
}
```

## 5. Rating rubric (draft)

Based on established frameworks so the ratings rest on accepted standards, not on our own judgment.

**Bias score** (adapted from Cochrane RoB 2 domains + funding):
- Randomization process
- Deviations from intended interventions (blinding)
- Missing outcome data
- Measurement of the outcome
- Selection of the reported result
- Funding / author conflicts (manufacturer-funded is not disqualifying, but it is scored)

**Thoroughness score** (adapted from GRADE):
- Sample size / precision
- Trial duration relative to the outcome
- Population matches the user (indirectness)
- Comparator: head-to-head > placebo-controlled > single-arm > observational
- Consistency with other evidence

**Guarding against model bias:**
- Mask drug and brand names before the LLM rates a claim
- Review 100% of ratings by hand for v1
- Have a second person rate a sample of about 20 claims and measure agreement

## 6. Scoring math

For option *d*, dimension *k*:

- Claim weight: `w_i = bias_i × thoroughness_i`
- Dimension score: `S(d,k) = Σ w_i · e_i / Σ w_i`, where `e_i` is the effect normalized to 0–1 on a fixed scale per metric (weight loss: 0 to 20+ percentage points vs placebo; stomach side effects: average excess nausea, diarrhea and vomiting vs placebo from FDA labels, 0 to 30+ points, inverted), not min-max across options, so scores stay stable as evidence is added
  - **Weighted mean, not sum**, so more studies do not mean a higher score
- Evidence confidence: `C(d,k) = f(Σ w_i)`, shown to the user **separately** and never mixed into the score
- Missing evidence: neutral score (0.5) with an "insufficient evidence" flag. Dropping the dimension and renormalizing would reward drugs with less data.
- Final: `Score(d) = Σ_k u_k · S(d,k) / Σ_k u_k`, where `u_k` are the user's priority weights

Hard constraints (budget ceiling, needle aversion, contraindications) **filter options out** before scoring.

## 7. Questionnaire (brand-blind)

- Priorities (weights): weight loss, GI tolerability, serious adverse event risk, cardiovascular benefit, convenience (dosing frequency), cost
- Hard constraints: monthly budget, injection OK?, relevant medical history (contraindication screen, framed as "tell your doctor")
- Weighting method: 5-level importance per priority (0 = not important, excluded from scoring). Starts unanswered to avoid anchoring. Possible upgrade: pairwise comparisons.
- Built (v1): priorities, injection preference, monthly budget. Answers stay in the browser.
- Deferred until real label data exists: medical-history / contraindication screen and treatment goal (weight vs. type 2 diabetes, which changes which brands apply). Both should be driven by sourced facts in the matrix, not hard-coded.

## 8. Milestones

| # | Milestone | Done when |
|---|-----------|-----------|
| 0 ✅ | Setup | Repo, uv + Python 3.12, Next.js scaffold, sample_matrix.json |
| 1 | Rubric calibration | ~20 claims hand-rated; rubric v0.2 |
| 2 ✅ | Web app on sample data | Questionnaire → ranked results with citations, scoring unit-tested |
| 3 | Pipeline | Fetch + extract + rate for all options; review CSV round-trip |
| 4 | Real matrix | All claims reviewed; claim_matrix.json built; web reads it |
| 5 | Deploy + user tests | Live URL; 1–2 people considering a GLP-1 complete the flow |

Milestones 1 and 2 can run in parallel because the JSON contract separates them.

## 9. Open decisions

- Drug list: approvals checked 2026-11-24 (section 3). Wegovy pill, Foundayo, semaglutide 7.2 mg and MASH now confirmed from DailyMed labels. Still open: recheck CagriSema, and decide whether T2D-only drugs (dulaglutide) belong once the treatment-goal question exists
- Sprint length / deadline
- LLM API budget (estimate once claim volume is known)
- Prices: manufacturer self-pay pages (NovoCare, LillyDirect) and Novo's list price for Saxenda, checked 2026-11-24 (`data/facts_draft.json`). Still open: how often to re-check (`build_matrix verify` refetches after the page cache is cleared), and whether to list generic liraglutide once a reliable price source exists
- Regulatory framing: "educational, discuss with your clinician" (needs a proper review)
- Recruiting 1–2 test users
