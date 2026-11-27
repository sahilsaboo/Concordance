"""Data contract for claim_matrix.json.

This is the single interface between the Python pipeline and the Next.js app.
The TypeScript mirror lives in web/lib/types.ts; keep the two in sync.
Pydantic validates the file, so a malformed matrix fails here, before it ever reaches the website.
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Score = float  # 0-1, higher is better for the user
Unit = Field(ge=0.0, le=1.0)


class Meta(BaseModel):
    schema_version: str
    rubric_version: str
    generated_at: str
    is_sample: bool = False
    note: str | None = None


class Dimension(BaseModel):
    id: str
    label: str
    basis: Literal["claims", "facts"]  # claims are bias-rated; facts are verified and dated


class Option(BaseModel):
    id: str
    blind_label: str  # what the user sees before results (brand-blind)
    molecule: str
    route: Literal["injection", "oral"]
    brands: list[str]


class Source(BaseModel):
    id: str
    title: str
    url: str
    type: Literal["rct", "meta_analysis", "observational", "label", "price", "hta_report", "other"]
    year: int
    funding: Literal["manufacturer", "independent", "regulator", "mixed", "unknown"]


class Effect(BaseModel):
    metric: str
    value: float
    timepoint_weeks: int | None = None
    normalized: Score = Unit  # set by build_matrix: 0-1 across options, higher = better for user


class Ratings(BaseModel):
    bias: Score = Unit  # higher = less biased
    thoroughness: Score = Unit
    rationale: str
    rater: Literal["llm", "human"]
    rubric_version: str


class Review(BaseModel):
    status: Literal["pending", "approved", "edited", "rejected"]
    reviewer: str | None = None
    notes: str | None = None


class Claim(BaseModel):
    id: str
    option: str
    dimension: str
    statement: str
    effect: Effect
    # How much the outcome matters within its priority (e.g. serious adverse events 3, stopping treatment 1).
    # Multiplies the claim's weight in the priority's average, but not the evidence confidence.
    severity: float = Field(default=1.0, gt=0)
    source_id: str
    ratings: Ratings
    review: Review


class Fact(BaseModel):
    id: str
    option: str
    dimension: str
    kind: str
    value: str | float
    normalized: Score = Unit
    source_id: str
    as_of: str


class Gap(BaseModel):
    """A known reason an option has no score for a priority, e.g. its only heart trial wasn't placebo-controlled.

    Shown instead of the generic "no reviewed evidence" text. The score stays neutral either way."""
    option: str
    dimension: str
    reason: str  # one short sentence, e.g. "No placebo-controlled heart trial yet."
    detail: str | None = None  # what evidence exists and why it isn't scored
    source_ids: list[str] = []


class Notice(BaseModel):
    """Something a person should know about an option that isn't a score, e.g. it's being discontinued."""
    option: str
    text: str
    source_ids: list[str]
    as_of: str


class ClaimMatrix(BaseModel):
    meta: Meta
    dimensions: list[Dimension]
    options: list[Option]
    sources: list[Source]
    claims: list[Claim]
    facts: list[Fact]
    gaps: list[Gap] = []
    notices: list[Notice] = []

    @model_validator(mode="after")
    def check_references(self) -> "ClaimMatrix":
        """Every claim/fact must point at a real option, dimension, and source."""
        option_ids = {o.id for o in self.options}
        dim_ids = {d.id for d in self.dimensions}
        source_ids = {s.id for s in self.sources}
        for rec in [*self.claims, *self.facts]:
            if rec.option not in option_ids:
                raise ValueError(f"{rec.id}: unknown option {rec.option!r}")
            if rec.dimension not in dim_ids:
                raise ValueError(f"{rec.id}: unknown dimension {rec.dimension!r}")
            if rec.source_id not in source_ids:
                raise ValueError(f"{rec.id}: unknown source {rec.source_id!r}")
        for g in self.gaps:
            if g.option not in option_ids or g.dimension not in dim_ids:
                raise ValueError(f"gap {g.option}/{g.dimension}: unknown option or dimension")
            if missing := [s for s in g.source_ids if s not in source_ids]:
                raise ValueError(f"gap {g.option}/{g.dimension}: unknown sources {missing}")
        for n in self.notices:
            if n.option not in option_ids:
                raise ValueError(f"notice: unknown option {n.option!r}")
            if missing := [s for s in n.source_ids if s not in source_ids]:
                raise ValueError(f"notice {n.option}: unknown sources {missing}")
        return self
