import { describe, expect, it } from "vitest";
import { loadMatrix, loadSampleMatrix } from "./matrix";

describe("loadSampleMatrix", () => {
  const m = loadSampleMatrix();

  it("drops claims that have not passed human review", () => {
    expect(m.claims.some((c) => c.id === "c_sample_08")).toBe(false);
    expect(m.claims.every((c) => ["approved", "edited"].includes(c.review.status))).toBe(true);
  });

  it("the app's built matrix never contains sample claims", () => {
    expect(loadMatrix().claims.some((c) => c.statement.includes("[SAMPLE]"))).toBe(false);
  });

  it("gives every option a brand-blind label", () => {
    for (const o of m.options) expect(o.blind_label).not.toMatch(new RegExp(o.brands.join("|"), "i"));
  });
});
