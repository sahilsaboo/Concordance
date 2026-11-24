import { describe, expect, it } from "vitest";
import { factText } from "./Results";
import type { Fact } from "@/lib/types";

const fact = (over: Partial<Fact>): Fact => ({
  id: "f", option: "o", dimension: "cost", kind: "monthly_price_usd", value: 1349.02, normalized: 0.1, source_id: "s", as_of: "2026-11-24", ...over,
});

describe("factText", () => {
  it("formats monthly prices as dollars", () => {
    expect(factText(fact({}))).toBe("Monthly price: $1,349.02 (as of 2026-11-24)");
    expect(factText(fact({ value: 349 }))).toBe("Monthly price: $349 (as of 2026-11-24)");
  });

  it("shows dosing text as written", () => {
    expect(factText(fact({ kind: "dosing", value: "once weekly injection" }))).toBe("Dosing: once weekly injection (as of 2026-11-24)");
  });
});
