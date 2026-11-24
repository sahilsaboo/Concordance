"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ClaimMatrix } from "@/lib/types";
import { rank, type Importance } from "@/lib/scoring";
import { SampleBanner } from "@/components/Notices";
import Results from "./Results";
import {
  BUDGETS,
  EMPTY_DRAFT,
  IMPORTANCE_LEVELS,
  STEPS,
  allowedStep,
  clearDraft,
  limitErrors,
  loadDraft,
  priorityErrors,
  saveDraft,
  toAnswers,
  type Draft,
  type FieldError,
  type Step,
} from "./answers";

// Plain-language hints shown under each priority (HHS Health Literacy Online).
const PRIORITY_HINTS: Record<string, string> = {
  weight_loss: "How much weight people lost in studies.",
  gi_tolerability: "How often people in studies had nausea, vomiting, or diarrhea.",
  serious_ae_risk: "How often people in studies had serious side effects, such as ones needing hospital care.",
  cardiovascular: "Whether studies showed fewer heart attacks, strokes, or heart-related deaths.",
  convenience: "How often you take it, and whether it's a pill or a shot.",
  cost: "The typical monthly price without insurance.",
};

const STEP_TITLES: Record<Step, string> = {
  priorities: "What matters most to you?",
  limits: "Your practical limits",
  results: "Your results",
};

const stepFromUrl = (): Step => {
  const s = new URLSearchParams(window.location.search).get("step");
  return STEPS.includes(s as Step) ? (s as Step) : "priorities";
};

const noopSubscribe = () => () => {};
const isBrowser = typeof window !== "undefined";

export default function Compare({ matrix }: { matrix: ClaimMatrix }) {
  const dims = matrix.dimensions;
  // false while the server renders and during hydration, true afterwards. Saved answers only exist in the
  // browser, so the form renders after hydration to keep server and client HTML identical.
  const ready = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  // Priorities start unanswered on purpose: a pre-filled default would anchor the user's choices.
  // A draft saved in this tab (reload) is restored; otherwise it's empty.
  const [draft, setDraft] = useState<Draft>(() => (isBrowser ? loadDraft() : EMPTY_DRAFT));
  const [step, setStep] = useState<Step>(() =>
    isBrowser ? allowedStep(stepFromUrl(), loadDraft(), dims) : "priorities",
  );
  const [attempted, setAttempted] = useState<Step | null>(null);
  const focusHeading = useRef(false);
  // IDs are unique per instance and DOM lookups stay inside this instance's root, so focus and error links
  // can never land on another copy of the form.
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Keep the URL in step with where the user actually is, and handle browser back/forward.
  useEffect(() => {
    const target = allowedStep(stepFromUrl(), loadDraft(), dims);
    window.history.replaceState({ step: target }, "", `?step=${target}`);

    const onPop = () => {
      setAttempted(null);
      setStep(allowedStep(stepFromUrl(), loadDraft(), dims));
      focusHeading.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dims]);

  useEffect(() => {
    if (ready) saveDraft(draft);
  }, [draft, ready]);

  const errors: FieldError[] =
    attempted === "priorities" ? priorityErrors(draft, dims) : attempted === "limits" ? limitErrors(draft) : [];

  // Page title tells screen-reader users where they are and whether there's an error (GOV.UK pattern).
  useEffect(() => {
    if (!ready) return;
    const n = STEPS.indexOf(step) + 1;
    document.title = `${errors.length ? "Error: " : ""}${STEP_TITLES[step]} (step ${n} of 3) | Concordance`;
  }, [ready, step, errors.length]);

  // After moving between steps, put keyboard focus on the new heading.
  useEffect(() => {
    if (!ready || !focusHeading.current) return;
    focusHeading.current = false;
    window.scrollTo({ top: 0 });
    rootRef.current?.querySelector<HTMLElement>("[data-step-heading]")?.focus();
  }, [ready, step]);

  const go = (next: Step) => {
    setAttempted(null);
    focusHeading.current = true;
    window.history.pushState({ step: next }, "", `?step=${next}`);
    setStep(next);
  };

  const submit = (current: Step, next: Step) => {
    const errs = current === "priorities" ? priorityErrors(draft, dims) : limitErrors(draft);
    if (errs.length) {
      setAttempted(current);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    go(next);
  };

  if (!ready)
    return (
      <div ref={rootRef}>
        <p className="text-muted">Loading…</p>
      </div>
    );

  const answers = toAnswers(draft, dims);
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const stepNumber = STEPS.indexOf(step) + 1;

  return (
    <div ref={rootRef}>
      {step !== "priorities" && (
        <button type="button" onClick={() => window.history.back()} className="btn-ghost -ml-3 mb-4 print:hidden">
          <span aria-hidden="true">←</span> Back
        </button>
      )}
      <Progress step={step} />
      {matrix.meta.is_sample && (
        <div className="mt-6">
          <SampleBanner />
        </div>
      )}

      {errors.length > 0 && <ErrorSummary ref={summaryRef} errors={errors} idPrefix={uid} rootRef={rootRef} />}

      {step === "results" && answers ? (
        <Results
          matrix={matrix}
          ranking={rank(matrix, answers)}
          onEdit={() => go("priorities")}
          onRestart={() => {
            clearDraft();
            setDraft(EMPTY_DRAFT);
            go("priorities");
          }}
        />
      ) : (
        <form
          noValidate
          className="mt-8 grid gap-10 lg:mt-10 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:gap-16"
          onSubmit={(e) => {
            e.preventDefault();
            submit(step, step === "priorities" ? "limits" : "results");
          }}
        >
          {/* Left: what this step is. Stays in view on wide screens while the questions scroll. */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            <p className="label-caps text-xs text-muted">Step {stepNumber} of 3</p>
            <h1
              data-step-heading
              tabIndex={-1}
              className="mt-2 font-display text-4xl font-light tracking-tight focus:outline-none sm:text-5xl"
            >
              {STEP_TITLES[step]}
            </h1>
            <p className="mt-3 max-w-prose text-lg leading-relaxed text-muted">
              {step === "priorities"
                ? "Rate each one. You won't see any drug or brand names until your results."
                : "Options that don't fit these are set aside, not ranked lower. Your results will show what was set aside and why."}
            </p>
          </div>

          {/* Right: the questions. */}
          <div>
            {step === "priorities" ? (
              <>
                <div className="grid gap-10">
                  {dims.map((d) => (
                    <ChoiceGroup
                      idPrefix={uid}
                      key={d.id}
                      name={d.id}
                      legend={d.label}
                      hint={PRIORITY_HINTS[d.id]}
                      error={errorFor(d.id)}
                      options={IMPORTANCE_LEVELS.map((l) => ({ key: String(l.value), label: l.label }))}
                      selected={draft.importance[d.id] === undefined ? undefined : String(draft.importance[d.id])}
                      onSelect={(k) =>
                        setDraft((prev) => ({
                          ...prev,
                          importance: { ...prev.importance, [d.id]: Number(k) as Importance },
                        }))
                      }
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-10">
                  <ChoiceGroup
                    idPrefix={uid}
                    name="injections"
                    legend="Are you comfortable giving yourself an injection?"
                    hint="Some options are small injections you give yourself under the skin. Others are pills."
                    error={errorFor("injections")}
                    options={[
                      { key: "yes", label: "Yes, injections are fine" },
                      { key: "no", label: "No, pills only" },
                    ]}
                    selected={draft.injections ?? undefined}
                    onSelect={(k) => setDraft((prev) => ({ ...prev, injections: k as "yes" | "no" }))}
                  />
                  <ChoiceGroup
                    idPrefix={uid}
                    name="budget"
                    legend="What could you pay each month without insurance?"
                    hint="We compare this with cash prices. With insurance or savings programs, you may pay less."
                    error={errorFor("budget")}
                    options={BUDGETS.map((b) => ({ key: b.key, label: b.label }))}
                    selected={draft.budget ?? undefined}
                    onSelect={(k) => setDraft((prev) => ({ ...prev, budget: k as Draft["budget"] }))}
                  />
                </div>
              </>
            )}

            <div className="mt-12 border-t border-line pt-8">
              <button type="submit" className="btn-primary w-full sm:w-auto">
                {step === "priorities" ? "Continue" : "See my results"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  const i = STEPS.indexOf(step);
  const labels = ["Priorities", "Limits", "Results"];
  return (
    <nav aria-label="Progress" className="print:hidden">
      <ol className="flex gap-2">
        {labels.map((l, j) => (
          <li
            key={l}
            aria-current={j === i ? "step" : undefined}
            className={`label-caps flex-1 border-t-4 pt-2 text-xs ${j <= i ? "border-primary text-foreground" : "border-line text-muted"}`}
          >
            <span className="sr-only">{j < i ? "Completed: " : j === i ? "Current: " : ""}</span>
            {l}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ErrorSummary({
  errors,
  ref,
  idPrefix,
  rootRef,
}: {
  errors: FieldError[];
  ref: React.Ref<HTMLDivElement>;
  idPrefix: string;
  rootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const titleId = `${idPrefix}-error-summary-title`;
  const jump = (field: string) => {
    const input = rootRef.current?.querySelector<HTMLInputElement>(`input[name="${field}"]`);
    input?.closest("fieldset")?.scrollIntoView({ block: "start" });
    input?.focus({ preventScroll: true });
  };
  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="mt-6 rounded-lg border-2 border-error bg-surface p-5 focus:outline-none print:hidden"
    >
      <h2 id={titleId} className="text-lg font-semibold text-error">
        There is a problem
      </h2>
      <ul className="mt-3 space-y-2">
        {errors.map((e) => (
          <li key={e.field + e.message}>
            <a
              href={`#${idPrefix}-field-${e.field}`}
              onClick={(ev) => {
                ev.preventDefault();
                jump(e.field);
              }}
              className="font-medium text-error underline underline-offset-4"
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChoiceGroup(props: {
  idPrefix: string;
  name: string;
  legend: string;
  hint?: string;
  error?: string;
  options: { key: string; label: string }[];
  selected: string | undefined;
  onSelect: (key: string) => void;
}) {
  const hintId = `${props.idPrefix}-${props.name}-hint`;
  const errorId = `${props.idPrefix}-${props.name}-error`;
  return (
    <fieldset
      id={`${props.idPrefix}-field-${props.name}`}
      aria-describedby={[props.hint && hintId, props.error && errorId].filter(Boolean).join(" ") || undefined}
      className={`scroll-mt-6 ${props.error ? "border-l-4 border-error pl-4" : ""}`}
    >
      <legend className="text-lg font-medium">{props.legend}</legend>
      {props.hint && (
        <p id={hintId} className="mt-1 text-muted">
          {props.hint}
        </p>
      )}
      {props.error && (
        <p id={errorId} className="mt-2 font-medium text-error">
          <span className="sr-only">Error: </span>
          {props.error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {props.options.map((o) => (
          <label
            key={o.key}
            className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-surface px-4 transition-colors hover:border-primary has-checked:border-primary has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-3 has-focus-visible:outline-offset-3 has-focus-visible:outline-focus"
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
