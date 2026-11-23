import { describe, expect, it } from "vitest";
import { loadMatrix } from "./matrix";

describe("loadMatrix", () => {
  const m = loadMatrix();

  it("drops claims that have not passed human review", () => {
    expect(m.claims.some((c) => c.id === "c_sample_08")).toBe(false);
    expect(m.claims.every((c) => ["approved", "edited"].includes(c.review.status))).toBe(true);
  });

  it("gives every option a brand-blind label", () => {
    for (const o of m.options) expect(o.blind_label).not.toMatch(new RegExp(o.brands.join("|"), "i"));
  });
});
