import built from "../../data/claim_matrix.json";
import sample from "../../data/sample_matrix.json";
import type { Claim, ClaimMatrix } from "./types";

// claim_matrix.json is built by the pipeline (concordance_pipeline.build_matrix) from reviewed studies.
// sample_matrix.json stays as a fixed, hand-written fixture for tests.

const USABLE: ReadonlySet<Claim["review"]["status"]> = new Set(["approved", "edited"]);

/**
 * Only human-reviewed claims reach users. Pending or rejected claims are dropped here,
 * which is the "human" half of hybrid rating.
 */
export function reviewedOnly(raw: ClaimMatrix): ClaimMatrix {
  return { ...raw, claims: raw.claims.filter((c) => USABLE.has(c.review.status)) };
}

/** The matrix the app shows. */
export function loadMatrix(): ClaimMatrix {
  return reviewedOnly(built as ClaimMatrix);
}

/** Hand-written fixture with known placeholder values, for tests of the scoring math. */
export function loadSampleMatrix(): ClaimMatrix {
  return reviewedOnly(sample as ClaimMatrix);
}
