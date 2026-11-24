// Questionnaire state, validation, and session persistence. Pure where possible so it can be unit-tested.
import type { Answers, Importance } from "@/lib/scoring";
import type { Dimension } from "@/lib/types";

export type Step = "priorities" | "limits" | "results";
export const STEPS: Step[] = ["priorities", "limits", "results"];

export type BudgetKey = "250" | "500" | "1000" | "any";

export interface Draft {
  importance: Partial<Record<string, Importance>>;
  injections: "yes" | "no" | null;
  budget: BudgetKey | null;
}

export const EMPTY_DRAFT: Draft = { importance: {}, injections: null, budget: null };

export const IMPORTANCE_LEVELS: { value: Importance; label: string }[] = [
  { value: 0, label: "Not important" },
  { value: 1, label: "A little" },
  { value: 2, label: "Somewhat" },
  { value: 3, label: "Very" },
  { value: 4, label: "Top priority" },
];

export const BUDGETS: { key: BudgetKey; label: string; usd: number | null }[] = [
  { key: "250", label: "Up to $250", usd: 250 },
  { key: "500", label: "Up to $500", usd: 500 },
  { key: "1000", label: "Up to $1,000", usd: 1000 },
  { key: "any", label: "No limit or not sure", usd: null },
];

export interface FieldError {
  field: string; // the fieldset's name; links target its first option
  message: string;
}

export function priorityErrors(d: Draft, dims: Dimension[]): FieldError[] {
  const missing = dims
    .filter((dim) => d.importance[dim.id] === undefined)
    .map((dim) => ({ field: dim.id, message: `Choose how important "${dim.label.split(" (")[0].toLowerCase()}" is to you` }));
  if (missing.length) return missing;
  if (dims.every((dim) => d.importance[dim.id] === 0)) {
    return [{ field: dims[0].id, message: 'Mark at least one priority as more than "Not important" so we have something to rank on' }];
  }
  return [];
}

export function limitErrors(d: Draft): FieldError[] {
  const errors: FieldError[] = [];
  if (d.injections === null) errors.push({ field: "injections", message: "Choose whether you're comfortable with injections" });
  if (d.budget === null) errors.push({ field: "budget", message: "Choose what you could pay each month" });
  return errors;
}

export function toAnswers(d: Draft, dims: Dimension[]): Answers | null {
  if (priorityErrors(d, dims).length || limitErrors(d).length) return null;
  return {
    importance: d.importance as Record<string, Importance>,
    injectionsOk: d.injections === "yes",
    maxMonthlyBudgetUsd: BUDGETS.find((b) => b.key === d.budget)!.usd,
  };
}

/** The furthest step the user may be on, given what they've answered (guards deep links and back/forward). */
export function allowedStep(requested: Step, d: Draft, dims: Dimension[]): Step {
  if (requested === "priorities" || priorityErrors(d, dims).length) return "priorities";
  if (requested === "limits" || limitErrors(d).length) return "limits";
  return "results";
}

// sessionStorage: survives a reload, cleared when the tab closes, never sent anywhere.
const STORAGE_KEY = "concordance:draft:v1";

export function loadDraft(): Draft {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return { ...EMPTY_DRAFT, ...parsed, importance: { ...(parsed.importance ?? {}) } };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(d: Draft): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    // Storage blocked (private mode, settings): the form still works, it just won't survive a reload.
  }
}

export function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
