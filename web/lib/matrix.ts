import sample from "../../data/sample_matrix.json";
import type { Claim, ClaimMatrix } from "./types";

// Swap to ../../data/claim_matrix.json once the pipeline produces real data (milestone 4).
const raw = sample as ClaimMatrix;

const USABLE: ReadonlySet<Claim["review"]["status"]> = new Set(["approved", "edited"]);

/**
 * The matrix the app is allowed to use: only human-reviewed claims.
 * Pending or rejected claims never reach users, which is the "human" half of hybrid rating.
 */
export function loadMatrix(): ClaimMatrix {
  return { ...raw, claims: raw.claims.filter((c) => USABLE.has(c.review.status)) };
}
