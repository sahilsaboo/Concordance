"use client";

import { useEffect, useState } from "react";
import type { ClaimMatrix } from "@/lib/types";
import { rank, type Answers, type Importance } from "@/lib/scoring";
import { SampleBanner } from "@/components/Notices";
import Results from "./Results";

const IMPORTANCE_LEVELS: { value: Importance; label: string }[] = [
  { value: 0, label: "Not important" },
  { value: 1, label: "A little" },
  { value: 2, label: "Somewhat" },
  { value: 3, label: "Very" },
  { value: 4, label: "Top priority" },
];

const BUDGETS: { value: number | null; label: string }[] = [
  { value: 250, label: "Up to $250" },
  { value: 500, label: "Up to $500" },
  { value: 1000, label: "Up to $1,000" },
  { value: null, label: "No limit / not sure" },
];

type Step = "priorities" | "limits" | "results";
const STEPS: Step[] = ["priorities", "limits", "results"];

export default function Compare({ matrix }: { matrix: ClaimMatrix }) {
  const [step, setStep] = useState<Step>("priorities");
  // Priorities start unanswered on purpose: a pre-filled default would anchor the user's choices.
  const [importance, setImportance] = useState<Partial<Record<string, Importance>>>({});
  const [injectionsOk, setInjectionsOk] = useState<boolean | null>(null);
  const [budget, setBudget] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const allPrioritiesAnswered = matrix.dimensions.every((d) => importance[d.id] !== undefined);
  const anyPriorityImportant = matrix.dimensions.some((d) => (importance[d.id] ?? 0) > 0);
  const limitsAnswered = injectionsOk !== null && budget !== undefined;

  const answers: Answers | null =
    allPrioritiesAnswered && anyPriorityImportant && limitsAnswered
      ? {
          importance: importance as Record<string, Importance>,
          injectionsOk: injectionsOk!,
          maxMonthlyBudgetUsd: budget ?? null,
        }
      : null;

  // Cheap (4 options x 6 priorities), so recompute each render instead of memoizing.
  const ranking = answers ? rank(matrix, answers) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Progress step={step} />
      {matrix.meta.is_sample && <SampleBanner note={matrix.meta.note} />}

      {step === "priorities" && (
        <section className="mt-8">
          <h1 className="text-2xl font-semibold tracking-tight">What matters most to you?</h1>
          <p className="mt-2 text-muted">
            Rate each one. You won&apos;t see any drug or brand names until your results.
          </p>
          <div className="mt-8 space-y-8">
            {matrix.dimensions.map((d) => (
              <ChoiceGroup
                key={d.id}
                name={d.id}
                legend={d.label}
                options={IMPORTANCE_LEVELS.map((l) => ({ key: String(l.value), label: l.label }))}
                selected={importance[d.id] === undefined ? undefined : String(importance[d.id])}
                onSelect={(k) => setImportance((prev) => ({ ...prev, [d.id]: Number(k) as Importance }))}
              />
            ))}
          </div>
          {allPrioritiesAnswered && !anyPriorityImportant && (
            <p className="mt-6 text-sm text-accent-text">
              Mark at least one priority as important so we have something to rank on.
            </p>
          )}
          <Nav
            next={{
              label: "Next",
              disabled: !allPrioritiesAnswered || !anyPriorityImportant,
              onClick: () => setStep("limits"),
            }}
          />
        </section>
      )}

      {step === "limits" && (
        <section className="mt-8">
          <h1 className="text-2xl font-semibold tracking-tight">Your practical limits</h1>
          <p className="mt-2 text-muted">
            Options that don&apos;t fit these are set aside, not ranked lower. We&apos;ll show you what was set aside and
            why.
          </p>
          <div className="mt-8 space-y-8">
            <ChoiceGroup
              name="injections"
              legend="Are you open to a weekly or daily injection?"
              options={[
                { key: "yes", label: "Yes, injections are fine" },
                { key: "no", label: "No, pills only" },
              ]}
              selected={injectionsOk === null ? undefined : injectionsOk ? "yes" : "no"}
              onSelect={(k) => setInjectionsOk(k === "yes")}
            />
            <ChoiceGroup
              name="budget"
              legend="What could you pay per month, out of pocket?"
              options={BUDGETS.map((b) => ({ key: String(b.value), label: b.label }))}
              selected={budget === undefined ? undefined : String(budget)}
              onSelect={(k) => setBudget(k === "null" ? null : Number(k))}
            />
          </div>
          <Nav
            back={() => setStep("priorities")}
            next={{ label: "See my results", disabled: !limitsAnswered, onClick: () => setStep("results") }}
          />
        </section>
      )}

      {step === "results" && ranking && (
        <Results
          matrix={matrix}
          ranking={ranking}
          onEdit={() => setStep("priorities")}
          onRestart={() => {
            setImportance({});
            setInjectionsOk(null);
            setBudget(undefined);
            setStep("priorities");
          }}
        />
      )}
    </main>
  );
}

function Progress({ step }: { step: Step }) {
  const i = STEPS.indexOf(step);
  const labels = ["Priorities", "Limits", "Results"];
  return (
    <ol className="flex gap-2 text-sm" aria-label="Progress">
      {labels.map((l, j) => (
        <li
          key={l}
          aria-current={j === i ? "step" : undefined}
          className={`flex-1 border-t-4 pt-2 ${j <= i ? "border-primary text-foreground" : "border-line text-muted"}`}
        >
          {j + 1}. {l}
        </li>
      ))}
    </ol>
  );
}

function ChoiceGroup(props: {
  name: string;
  legend: string;
  options: { key: string; label: string }[];
  selected: string | undefined;
  onSelect: (key: string) => void;
}) {
  return (
    <fieldset>
      <legend className="font-medium">{props.legend}</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.options.map((o) => (
          <label
            key={o.key}
            className="cursor-pointer rounded-full border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-primary has-checked:border-primary has-checked:bg-primary has-checked:text-on-primary has-focus-visible:ring-2 has-focus-visible:ring-primary has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background"
          >
            <input
              type="radio"
              className="sr-only"
              name={props.name}
              value={o.key}
              checked={props.selected === o.key}
              onChange={() => props.onSelect(o.key)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Nav(props: { back?: () => void; next: { label: string; disabled: boolean; onClick: () => void } }) {
  return (
    <div className="mt-10 flex items-center justify-between">
      {props.back ? (
        <button onClick={props.back} className="rounded-lg px-4 py-2 text-muted hover:text-foreground">
          ← Back
        </button>
      ) : (
        <span />
      )}
      <button
        onClick={props.next.onClick}
        disabled={props.next.disabled}
        className="rounded-lg bg-primary px-6 py-3 font-medium text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
      >
        {props.next.label}
      </button>
    </div>
  );
}
