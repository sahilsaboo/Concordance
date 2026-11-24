import { describe, expect, it } from "vitest";
import { loadSampleMatrix } from "./matrix";
import { NEUTRAL_SCORE, rank, type Answers } from "./scoring";
import type { ClaimMatrix } from "./types";

const base = loadSampleMatrix();

const answers = (over: Partial<Answers> = {}): Answers => ({
  importance: { weight_loss: 4, gi_tolerability: 2, serious_ae_risk: 0, cardiovascular: 1, convenience: 3, cost: 2 },
  maxMonthlyBudgetUsd: null,
  injectionsOk: true,
  ...over,
});

const byId = (r: ReturnType<typeof rank>, id: string) => r.ranked.find((x) => x.option.id === id)!;
const dim = (r: ReturnType<typeof rank>, opt: string, d: string) =>
  byId(r, opt).dimensions.find((x) => x.dimensionId === d)!;

describe("rank", () => {
  it("is deterministic", () => {
    expect(rank(base, answers())).toEqual(rank(base, answers()));
  });

  it("uses a weighted mean: duplicating evidence does not raise the score", () => {
    const dup: ClaimMatrix = {
      ...base,
      claims: [...base.claims, ...base.claims.map((c) => ({ ...c, id: c.id + "_dup" }))],
    };
    const before = dim(rank(base, answers()), "semaglutide_injection", "weight_loss");
    const after = dim(rank(dup, answers()), "semaglutide_injection", "weight_loss");
    expect(after.score).toBeCloseTo(before.score);
    expect(after.claimIds.length).toBe(before.claimIds.length * 2);
  });

  it("gives missing evidence a neutral score and flags it", () => {
    const d = dim(rank(base, answers()), "liraglutide_injection", "gi_tolerability");
    expect(d.score).toBe(NEUTRAL_SCORE);
    expect(d.insufficientEvidence).toBe(true);
    expect(d.confidence).toBe("none");
  });

  it("weights less-biased claims more heavily", () => {
    // semaglutide_injection weight_loss: c01 (0.7, w=0.54) and c03 (0.65, w=0.72)
    const d = dim(rank(base, answers()), "semaglutide_injection", "weight_loss");
    expect(d.score).toBeCloseTo((0.54 * 0.7 + 0.72 * 0.65) / (0.54 + 0.72));
  });

  it("reports weight shares that sum to 1 and skips unimportant priorities", () => {
    const r = rank(base, answers());
    const dims = r.ranked[0].dimensions;
    expect(dims.reduce((s, d) => s + d.weightShare, 0)).toBeCloseTo(1);
    expect(dims.some((d) => d.dimensionId === "serious_ae_risk")).toBe(false);
  });

  it("filters out injections when the user does not want them", () => {
    const r = rank(base, answers({ injectionsOk: false }));
    expect(r.ranked.map((x) => x.option.route)).toEqual(["oral", "oral"]);
    expect(r.excluded).toHaveLength(3);
    expect(r.excluded[0].reasons).toContain("Requires injections");
  });

  it("filters out options over budget", () => {
    const r = rank(base, answers({ maxMonthlyBudgetUsd: 500 }));
    expect(r.excluded.map((x) => x.option.id).sort()).toEqual(["liraglutide_injection", "tirzepatide_injection"]);
  });

  it("changing priorities changes the ranking", () => {
    const efficacy = rank(base, answers({ importance: { weight_loss: 4 } }));
    const cost = rank(base, answers({ importance: { cost: 4 } }));
    expect(efficacy.ranked[0].option.id).toBe("tirzepatide_injection");
    expect(cost.ranked[0].option.id).toBe("semaglutide_oral");
  });

  it("gives tied options the same rank", () => {
    const r = rank(base, answers({ importance: { convenience: 4 } }));
    const weekly = r.ranked.filter((x) => x.total === 0.8);
    expect(weekly).toHaveLength(2);
    expect(weekly[0].rank).toBe(weekly[1].rank);
  });

  it("severity tilts the average but not the confidence", () => {
    const sae = base.claims.find((c) => c.id === "c_sample_01")!;
    const mk = (id: string, normalized: number, severity: number) => ({
      ...sae, id, dimension: "serious_ae_risk", effect: { ...sae.effect, normalized }, severity,
    });
    const flat: ClaimMatrix = { ...base, claims: [mk("a", 0.2, 1), mk("b", 1.0, 1)] };
    const tilted: ClaimMatrix = { ...base, claims: [mk("a", 0.2, 3), mk("b", 1.0, 1)] };
    const ans = answers({ importance: { serious_ae_risk: 4 } });
    const f = dim(rank(flat, ans), "semaglutide_injection", "serious_ae_risk");
    const t = dim(rank(tilted, ans), "semaglutide_injection", "serious_ae_risk");
    expect(f.score).toBeCloseTo(0.6);
    expect(t.score).toBeCloseTo((3 * 0.2 + 1.0) / 4);
    expect(t.confidence).toBe(f.confidence);
  });

  it("labels fact-based priorities as verified, not as study evidence", () => {
    expect(dim(rank(base, answers()), "semaglutide_injection", "cost").confidence).toBe("verified");
  });

  it("rejects answers with no priorities", () => {
    expect(() => rank(base, answers({ importance: {} }))).toThrow();
  });
});
