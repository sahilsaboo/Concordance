// TypeScript mirror of pipeline/src/concordance_pipeline/schema.py.
// The Python side validates the file; these types describe what the web app can rely on.
// Keep the two in sync when the schema changes.

export type Score = number; // 0–1, higher is better for the user

export interface Meta {
  schema_version: string;
  rubric_version: string;
  generated_at: string;
  is_sample: boolean;
  note?: string | null;
}

export interface Dimension {
  id: string;
  label: string;
  basis: "claims" | "facts";
}

export interface Option {
  id: string;
  blind_label: string;
  molecule: string;
  route: "injection" | "oral";
  brands: string[];
}

export interface Source {
  id: string;
  title: string;
  url: string;
  type: "rct" | "meta_analysis" | "observational" | "label" | "price" | "hta_report" | "other";
  year: number;
  funding: "manufacturer" | "independent" | "regulator" | "mixed" | "unknown";
}

export interface Claim {
  id: string;
  option: string;
  dimension: string;
  statement: string;
  effect: { metric: string; value: number; timepoint_weeks?: number | null; normalized: Score };
  /** How much this outcome matters within its priority (default 1). Weights the average, not the confidence. */
  severity?: number;
  source_id: string;
  ratings: {
    bias: Score;
    thoroughness: Score;
    rationale: string;
    rater: "llm" | "human";
    rubric_version: string;
  };
  review: { status: "pending" | "approved" | "edited" | "rejected"; reviewer?: string | null; notes?: string | null };
}

export interface Fact {
  id: string;
  option: string;
  dimension: string;
  kind: string;
  value: string | number;
  normalized: Score;
  source_id: string;
  as_of: string;
}

export interface ClaimMatrix {
  meta: Meta;
  dimensions: Dimension[];
  options: Option[];
  sources: Source[];
  claims: Claim[];
  facts: Fact[];
}
