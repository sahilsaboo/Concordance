import { describe, expect, it } from "vitest";
import { gapFor, missingText } from "./Results";
import { loadMatrix } from "@/lib/matrix";

const m = loadMatrix();

describe("documented gaps", () => {
  it("explains why tirzepatide and orforglipron have no heart score", () => {
    for (const id of ["tirzepatide_injection", "orforglipron_oral"]) {
      const g = gapFor(m, id, "cardiovascular");
      expect(g?.reason).toBe("No placebo-controlled heart trial yet.");
      expect(g?.source_ids.length).toBeGreaterThan(0);
      expect(m.sources.some((s) => s.id === g?.source_ids[0])).toBe(true);
    }
  });

  it("uses the gap's reason instead of the generic text", () => {
    const g = gapFor(m, "tirzepatide_injection", "cardiovascular");
    expect(missingText(g)).toBe("No placebo-controlled heart trial yet. Counted as neutral (50), so it doesn't help or hurt.");
    expect(missingText(undefined)).toMatch(/^No reviewed evidence yet\./);
  });

  it("has no gap where an option is scored", () => {
    expect(gapFor(m, "semaglutide_injection", "cardiovascular")).toBeUndefined();
  });
});
