"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import type { ClaimMatrix, Fact, Gap, Source } from "@/lib/types";
import type { Confidence, DimensionResult, RankedOption, Ranking } from "@/lib/scoring";

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  none: "No evidence yet",
  low: "Limited evidence",
  moderate: "Moderate evidence",
  high: "Strong evidence",
  verified: "From label or price data, not a study",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** One readable line per fact, e.g. "Monthly price: $1,349.02 (as of 2026-11-24)". */
export function factText(f: Fact): string {
  if (f.kind === "monthly_price_usd" && typeof f.value === "number") return `Monthly price: ${usd.format(f.value)} (as of ${f.as_of})`;
  const kind = f.kind.replaceAll("_", " ");
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}: ${f.value} (as of ${f.as_of})`;
}

const FUNDING_LABEL: Record<Source["funding"], string> = {
  manufacturer: "Manufacturer-funded",
  independent: "Independent",
  regulator: "Regulator",
  mixed: "Mixed funding",
  unknown: "Funding unknown",
};

/** Who stands behind a source. A manufacturer's price page isn't "funded"; the manufacturer sets the price. */
export function sourceLabel(src: Pick<Source, "type" | "funding">): string {
  if (src.type === "price" && src.funding === "manufacturer") return "Set by the manufacturer";
  return FUNDING_LABEL[src.funding];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const optionName = (o: RankedOption["option"]) =>
  `${o.molecule.charAt(0).toUpperCase()}${o.molecule.slice(1)} (${o.route === "oral" ? "pill" : "injection"})`;
const shortLabel = (label: string) => label.split(" (")[0].toLowerCase();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The documented reason an option has no score for a priority, if there is one. */
export const gapFor = (m: ClaimMatrix, optionId: string, dimensionId: string): Gap | undefined =>
  m.gaps?.find((g) => g.option === optionId && g.dimension === dimensionId);

const NEUTRAL_NOTE = "Counted as neutral (50), so it doesn't help or hurt.";

/** Text under a priority with no score: the documented reason when known, otherwise the generic one. */
export function missingText(gap: Gap | undefined): string {
  return gap ? `${gap.reason} ${NEUTRAL_NOTE}` : `No reviewed evidence yet. ${NEUTRAL_NOTE}`;
}
const joinWords = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export default function Results(props: {
  matrix: ClaimMatrix;
  ranking: Ranking;
  onEdit: () => void;
  onRestart: () => void;
}) {
  const { matrix, ranking } = props;
  const dimLabel = (id: string) => matrix.dimensions.find((d) => d.id === id)?.label ?? id;
  const weights = ranking.ranked[0]?.dimensions ?? [];
  // IDs unique per instance; lookups stay inside this instance.
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const rootRef = useRef<HTMLElement>(null);

  // Printing (or "Save as PDF") should include the evidence, so open every collapsed section first.
  useEffect(() => {
    const opened: HTMLDetailsElement[] = [];
    const before = () =>
      rootRef.current?.querySelectorAll("details:not([open])").forEach((d) => {
        (d as HTMLDetailsElement).open = true;
        opened.push(d as HTMLDetailsElement);
      });
    const after = () => opened.splice(0).forEach((d) => (d.open = false));
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  return (
    <section ref={rootRef} className="mt-8" aria-labelledby={id("results-title")}>
      <p className="label-caps text-xs text-muted print:hidden">Step 3 of 3</p>
      <h1
        id={id("results-title")}
        data-step-heading
        tabIndex={-1}
        className="mt-2 font-display text-4xl font-light tracking-tight focus:outline-none sm:text-5xl"
      >
        Your results
      </h1>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* Left: your answer at a glance. */}
        <aside
          aria-label="Summary"
          // Pinned only when the window is tall enough to show all of it; otherwise it scrolls normally.
          className="lg:self-start lg:[@media(min-height:60rem)]:sticky lg:[@media(min-height:60rem)]:top-8"
        >
          <Summary ranking={ranking} matrix={matrix} dimLabel={dimLabel} />

          <div className="mt-6 flex flex-wrap gap-3 lg:flex-col print:hidden">
            <button type="button" onClick={() => window.print()} className="btn-secondary lg:w-full">
              Print or save as PDF
            </button>
            <button type="button" onClick={props.onEdit} className="btn-secondary lg:w-full">
              Change my answers
            </button>
          </div>

          {weights.length > 0 && (
            <section
              aria-labelledby={id("weights-title")}
              className="mt-6 rounded-xl border border-line bg-surface p-5"
            >
              <h2 id={id("weights-title")} className="label-caps text-xs font-semibold">
                How your priorities were weighted
              </h2>
              <p className="mt-2 text-sm text-muted">Based on how important you said each one is.</p>
              <ul className="mt-4 space-y-3">
                {[...weights]
                  .sort((a, b) => b.weightShare - a.weightShare)
                  .map((d) => (
                    <li key={d.dimensionId} className="grid grid-cols-[1fr_3.5rem] items-center gap-3">
                      <div>
                        <div>{dimLabel(d.dimensionId)}</div>
                        <Bar value={d.weightShare} className="bg-weight" />
                      </div>
                      <span className="text-right tabular-nums">{pct(d.weightShare)}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </aside>

        {/* Right: the ranked options and their evidence. */}
        <div>
          {ranking.ranked.length > 0 && (
            <>
              <h2 className="font-display text-3xl font-light">Ranked options</h2>
              <p className="mt-2 text-muted">
                The match score (0 to 100) shows how well each option fits your priorities.{" "}
                <Link href="/methodology#scoring" className="underline underline-offset-4 hover:text-accent-text">
                  How scores work
                </Link>
              </p>
              <ol className="mt-6 space-y-6">
                {ranking.ranked.map((r) => (
                  <OptionCard key={r.option.id} result={r} matrix={matrix} dimLabel={dimLabel} />
                ))}
              </ol>
            </>
          )}

          {ranking.excluded.length > 0 && (
            <section aria-labelledby={id("excluded-title")} className="mt-12">
              <h2 id={id("excluded-title")} className="font-display text-3xl font-light">
                Set aside by your limits
              </h2>
              <p className="mt-2 text-muted">These didn&apos;t fit the limits you set, so they weren&apos;t ranked.</p>
              <ul className="mt-4 space-y-3">
                {ranking.excluded.map((e) => (
                  <li key={e.option.id} className="rounded-lg border border-line p-4">
                    <span className="font-semibold">{optionName(e.option)}</span>
                    <span className="text-muted"> · sold as {e.option.brands.join(", ")}</span>
                    <div className="mt-1 text-muted">{e.reasons.join("; ")}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby={id("next-title")} className="mt-12 rounded-xl bg-notice-bg p-6 text-notice-text">
            <h2 id={id("next-title")} className="font-display text-3xl font-light">
              Before you decide
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed">
              <li>Share these results with your clinician. They can check what&apos;s safe for your health history.</li>
              <li>Ask your insurer or pharmacy what you would actually pay. It may differ from the prices here.</li>
              <li>Open the evidence under each option to see the sources and who funded them.</li>
            </ul>
          </section>

          <div className="mt-8 print:hidden">
            <button type="button" onClick={props.onRestart} className="btn-ghost -ml-3">
              Start over and clear my answers
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Summary({ ranking, matrix, dimLabel }: { ranking: Ranking; matrix: ClaimMatrix; dimLabel: (id: string) => string }) {
  if (ranking.ranked.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="text-lg">No options fit the limits you set.</p>
        <p className="mt-2 text-muted">Try a higher budget or allowing injections to see more options.</p>
      </div>
    );
  }
  const top = ranking.ranked.filter((r) => r.rank === 1);
  const best = top[0];
  const strengths = best.dimensions
    .filter((d) => !d.insufficientEvidence)
    .sort((a, b) => b.weightShare * b.score - a.weightShare * a.score)
    .slice(0, 2)
    .map((d) => shortLabel(dimLabel(d.dimensionId)));
  // Priorities with no score split into documented gaps (we know why) and plain missing evidence.
  const unscored = best.dimensions.filter((d) => d.insufficientEvidence);
  const known = unscored
    .map((d) => ({ d, gap: gapFor(matrix, best.option.id, d.dimensionId) }))
    .filter((x): x is { d: DimensionResult; gap: Gap } => x.gap !== undefined);
  const missing = unscored.length - known.length;

  return (
    <div className="rounded-xl border border-primary bg-surface p-6">
      <p className="label-caps text-xs text-muted">{top.length > 1 ? "Tied best matches" : "Best match for you"}</p>
      <p className="mt-2 font-display text-3xl">{joinWords(top.map((r) => optionName(r.option)))}</p>
      <p className="mt-1 text-muted">Sold as {top.flatMap((r) => r.option.brands).join(", ")}</p>
      {strengths.length > 0 && (
        <p className="mt-4 leading-relaxed">
          {top.length > 1 ? "Their" : "Its"} strongest areas for your priorities: {joinWords(strengths)}.
        </p>
      )}
      {known.map(({ d, gap }) => (
        <p key={d.dimensionId} className="mt-2 leading-relaxed text-muted">
          {capitalize(shortLabel(dimLabel(d.dimensionId)))} counts as neutral (50) for{" "}
          {top.length > 1 ? "the top option" : "it"}. {gap.reason}
        </p>
      ))}
      {missing > 0 && (
        <p className="mt-2 leading-relaxed text-muted">
          We don&apos;t have reviewed evidence yet for {missing} of your {best.dimensions.length} priorities, so treat
          this ranking as provisional.
        </p>
      )}
    </div>
  );
}

function OptionCard(props: { result: RankedOption; matrix: ClaimMatrix; dimLabel: (id: string) => string }) {
  const { result: r, matrix, dimLabel } = props;
  const headingId = `${useId()}-option-${r.option.id}`;
  return (
    <li aria-labelledby={headingId} className="rounded-xl border border-line bg-surface p-5 break-inside-avoid sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="label-caps text-xs text-muted">Rank {r.rank}</div>
          <h3 id={headingId} className="mt-1 font-display text-3xl font-medium">
            {optionName(r.option)}
          </h3>
          <div className="mt-1 text-muted">Sold as {r.option.brands.join(", ")}</div>
          <OptionNotices optionId={r.option.id} matrix={matrix} />
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-5xl leading-none font-light lining-nums tabular-nums">
            {Math.round(r.total * 100)}
          </div>
          <div className="label-caps mt-2 text-xs text-muted">
            <span aria-hidden="true">Match / 100</span>
            <span className="sr-only">match score out of 100</span>
          </div>
        </div>
      </div>

      <ul className="mt-6 space-y-4">
        {r.dimensions.map((d) => (
          <DimensionRow
            key={d.dimensionId}
            d={d}
            label={dimLabel(d.dimensionId)}
            gap={gapFor(matrix, r.option.id, d.dimensionId)}
          />
        ))}
      </ul>

      <Evidence result={r} matrix={matrix} dimLabel={dimLabel} />
    </li>
  );
}

/** Warnings about an option that aren't scores, such as being discontinued, with their source. */
function OptionNotices({ optionId, matrix }: { optionId: string; matrix: ClaimMatrix }) {
  const notices = (matrix.notices ?? []).filter((n) => n.option === optionId);
  if (!notices.length) return null;
  return (
    <>
      {notices.map((n) => {
        const src = matrix.sources.find((s) => s.id === n.source_ids[0]);
        return (
          <div
            key={n.text}
            role="note"
            className="mt-3 rounded-lg border border-notice-line bg-notice-bg p-3 text-sm leading-relaxed text-notice-text"
          >
            {n.text}{" "}
            {src && (
              <a href={src.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {src.title}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}{" "}
            (as of {n.as_of})
          </div>
        );
      })}
    </>
  );
}

function DimensionRow({ d, label, gap }: { d: DimensionResult; label: string; gap?: Gap }) {
  return (
    <li>
      <div className="flex justify-between gap-3">
        <span>
          {label} <span className="text-sm text-muted">· weighted {pct(d.weightShare)}</span>
        </span>
        <span className="tabular-nums">
          {d.insufficientEvidence ? (
            <>
              <span aria-hidden="true">n/a</span>
              <span className="sr-only">no score</span>
            </>
          ) : (
            Math.round(d.score * 100)
          )}
        </span>
      </div>
      <Bar value={d.insufficientEvidence ? 0 : d.score} className="bg-score" />
      <div className="mt-1 text-sm text-muted">
        {d.insufficientEvidence ? missingText(gap) : CONFIDENCE_LABEL[d.confidence]}
      </div>
    </li>
  );
}

function Evidence(props: { result: RankedOption; matrix: ClaimMatrix; dimLabel: (id: string) => string }) {
  const { result: r, matrix, dimLabel } = props;
  const source = (id: string) => matrix.sources.find((s) => s.id === id);
  const rows = r.dimensions.flatMap((d) => [
    ...d.claimIds.map((id) => {
      const c = matrix.claims.find((x) => x.id === id)!;
      return { id, dim: d.dimensionId, text: c.statement, src: source(c.source_id) };
    }),
    ...d.factIds.map((id) => {
      const f = matrix.facts.find((x) => x.id === id)!;
      return { id, dim: d.dimensionId, text: factText(f), src: source(f.source_id) };
    }),
    // A documented gap lists the evidence that exists but isn't scored, so readers can check the reason.
    ...(d.insufficientEvidence ? [gapFor(matrix, r.option.id, d.dimensionId)] : [])
      .filter((g): g is Gap => g !== undefined)
      .flatMap((g) =>
        (g.source_ids.length ? g.source_ids : [""]).map((sid) => ({
          id: `gap-${d.dimensionId}-${sid}`,
          dim: d.dimensionId,
          text: `Not scored: ${g.detail ?? g.reason}`,
          src: sid ? source(sid) : undefined,
        })),
      ),
  ]);
  if (!rows.length) return null;

  return (
    <details className="group mt-6 border-t border-line pt-4">
      <summary className="label-caps inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-accent-text">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ▸
        </span>
        Evidence and sources ({rows.length})
      </summary>
      <ul className="mt-3 space-y-4">
        {rows.map((row) => (
          <li key={row.id} className="border-l-2 border-line pl-4">
            <div className="label-caps text-xs text-muted">{shortLabel(dimLabel(row.dim))}</div>
            <div className="mt-1">{row.text}</div>
            {row.src && (
              <div className="mt-1 text-sm text-muted">
                <a
                  href={row.src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-accent-text"
                >
                  {row.src.title}
                  <span aria-hidden="true"> ↗</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>{" "}
                · {row.src.year} · {sourceLabel(row.src)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <div className="mt-2 h-2 w-full rounded-full bg-track print:border print:border-black" aria-hidden="true">
      <div
        className={`h-full rounded-full ${className}`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}
