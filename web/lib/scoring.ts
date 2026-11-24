// Ranking math from PLAN.md §6. Pure functions: same answers + same matrix => same ranking.
import type { Claim, ClaimMatrix, Fact, Option } from "./types";

/** 0 = not important (ignored), 4 = top priority. */
export type Importance = 0 | 1 | 2 | 3 | 4;

export interface Answers {
  importance: Record<string, Importance>; // keyed by dimension id
  maxMonthlyBudgetUsd: number | null; // null = no limit
  injectionsOk: boolean;
}

// "verified" is for fact-based priorities (price, dosing): checked against a source, not bias-rated.
export type Confidence = "none" | "low" | "moderate" | "high" | "verified";

export interface DimensionResult {
  dimensionId: string;
  score: number; // 0–1
  weightShare: number; // this priority's share of the user's total weight, 0–1
  confidence: Confidence;
  insufficientEvidence: boolean; // true => score is the neutral 0.5 placeholder
  claimIds: string[];
  factIds: string[];
}

export interface RankedOption {
  option: Option;
  rank: number; // ties share a rank
  total: number; // 0–1
  dimensions: DimensionResult[];
}

export interface ExcludedOption {
  option: Option;
  reasons: string[];
}

export interface Ranking {
  ranked: RankedOption[];
  excluded: ExcludedOption[];
}

export const NEUTRAL_SCORE = 0.5;
const TIE_EPSILON = 1e-9;

/** Weight of one claim: less biased and more thorough evidence counts more. */
export function claimWeight(c: Claim): number {
  return c.ratings.bias * c.ratings.thoroughness;
}

/**
 * Evidence confidence from the summed claim weight.
 * Thresholds are provisional (rubric v0.1) and should be recalibrated on real data.
 */
export function confidenceFromWeight(totalWeight: number): Confidence {
  if (totalWeight <= 0) return "none";
  if (totalWeight < 0.5) return "low";
  if (totalWeight < 1.5) return "moderate";
  return "high";
}

function monthlyPrice(facts: Fact[], optionId: string): number | null {
  const f = facts.find((x) => x.option === optionId && x.kind === "monthly_price_usd");
  return f && typeof f.value === "number" ? f.value : null;
}

/** Hard constraints remove options before scoring; they never just lower a score. */
function exclusionReasons(m: ClaimMatrix, o: Option, a: Answers): string[] {
  const reasons: string[] = [];
  if (!a.injectionsOk && o.route === "injection") reasons.push("Requires injections");
  if (a.maxMonthlyBudgetUsd !== null) {
    const price = monthlyPrice(m.facts, o.id);
    if (price !== null && price > a.maxMonthlyBudgetUsd)
      reasons.push(`Over your budget ($${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}/month)`);
  }
  return reasons;
}

function scoreDimension(m: ClaimMatrix, optionId: string, dimensionId: string) {
  const dim = m.dimensions.find((d) => d.id === dimensionId)!;

  if (dim.basis === "claims") {
    const claims = m.claims.filter((c) => c.option === optionId && c.dimension === dimensionId);
    const totalWeight = claims.reduce((s, c) => s + claimWeight(c), 0);
    // Weighted MEAN, not sum: more studies do not raise the score, only the confidence.
    const score =
      totalWeight > 0
        ? claims.reduce((s, c) => s + claimWeight(c) * c.effect.normalized, 0) / totalWeight
        : NEUTRAL_SCORE;
    return {
      score,
      confidence: confidenceFromWeight(totalWeight),
      insufficientEvidence: totalWeight === 0,
      claimIds: claims.map((c) => c.id),
      factIds: [] as string[],
    };
  }

  const facts = m.facts.filter((f) => f.option === optionId && f.dimension === dimensionId);
  const score = facts.length ? facts.reduce((s, f) => s + f.normalized, 0) / facts.length : NEUTRAL_SCORE;
  return {
    score,
    confidence: (facts.length ? "verified" : "none") as Confidence,
    insufficientEvidence: facts.length === 0,
    claimIds: [] as string[],
    factIds: facts.map((f) => f.id),
  };
}

export function rank(m: ClaimMatrix, a: Answers): Ranking {
  const active = m.dimensions.filter((d) => (a.importance[d.id] ?? 0) > 0);
  const totalImportance = active.reduce((s, d) => s + a.importance[d.id], 0);
  if (totalImportance === 0) throw new Error("At least one priority must be marked important.");

  const excluded: ExcludedOption[] = [];
  const scored: Omit<RankedOption, "rank">[] = [];

  for (const option of m.options) {
    const reasons = exclusionReasons(m, option, a);
    if (reasons.length) {
      excluded.push({ option, reasons });
      continue;
    }
    const dimensions: DimensionResult[] = active.map((d) => ({
      dimensionId: d.id,
      weightShare: a.importance[d.id] / totalImportance,
      ...scoreDimension(m, option.id, d.id),
    }));
    const total = dimensions.reduce((s, r) => s + r.weightShare * r.score, 0);
    scored.push({ option, total, dimensions });
  }

  scored.sort((x, y) => y.total - x.total);
  const ranked: RankedOption[] = [];
  scored.forEach((s, i) => {
    const prev = ranked[i - 1];
    const tied = prev && Math.abs(prev.total - s.total) < TIE_EPSILON;
    ranked.push({ ...s, rank: tied ? prev.rank : i + 1 });
  });

  return { ranked, excluded };
}
