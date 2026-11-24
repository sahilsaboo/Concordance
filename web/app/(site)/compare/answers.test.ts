import { describe, expect, it } from "vitest";
import { loadMatrix } from "@/lib/matrix";
import { allowedStep, EMPTY_DRAFT, limitErrors, priorityErrors, toAnswers, type Draft } from "./answers";

const dims = loadMatrix().dimensions;
const allRated = (n: 0 | 1 | 2 | 3 | 4): Draft["importance"] => Object.fromEntries(dims.map((d) => [d.id, n]));
const complete: Draft = { importance: allRated(2), injections: "yes", budget: "500" };

describe("questionnaire validation", () => {
  it("reports one error per unanswered priority", () => {
    expect(priorityErrors(EMPTY_DRAFT, dims)).toHaveLength(dims.length);
  });

  it("requires at least one priority above 'Not important'", () => {
    const errs = priorityErrors({ ...EMPTY_DRAFT, importance: allRated(0) }, dims);
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toMatch(/at least one/);
  });

  it("reports both missing limits", () => {
    expect(limitErrors(EMPTY_DRAFT).map((e) => e.field)).toEqual(["injections", "budget"]);
  });

  it("maps a complete draft to scoring answers", () => {
    expect(toAnswers(complete, dims)).toMatchObject({ injectionsOk: true, maxMonthlyBudgetUsd: 500 });
    expect(toAnswers({ ...complete, budget: "any" }, dims)?.maxMonthlyBudgetUsd).toBeNull();
  });
});

describe("allowedStep (deep links and back/forward)", () => {
  it("won't skip ahead past unanswered questions", () => {
    expect(allowedStep("results", EMPTY_DRAFT, dims)).toBe("priorities");
    expect(allowedStep("results", { ...EMPTY_DRAFT, importance: allRated(2) }, dims)).toBe("limits");
  });

  it("allows any step once everything is answered", () => {
    expect(allowedStep("results", complete, dims)).toBe("results");
    expect(allowedStep("priorities", complete, dims)).toBe("priorities");
  });
});
