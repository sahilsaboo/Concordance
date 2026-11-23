"use client";

import type { ClaimMatrix, Source } from "@/lib/types";
import type { Confidence, DimensionResult, RankedOption, Ranking } from "@/lib/scoring";
import { Disclaimer } from "@/components/Notices";

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  none: "No evidence yet",
  low: "Limited evidence",
  moderate: "Moderate evidence",
  high: "Strong evidence",
  verified: "From label or price data, not a study",
};

const FUNDING_LABEL: Record<Source["funding"], string> = {
  manufacturer: "Manufacturer-funded",
  independent: "Independent",
  regulator: "Regulator",
  mixed: "Mixed funding",
  unknown: "Funding unknown",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const title = (o: RankedOption["option"]) =>
  `${o.molecule.charAt(0).toUpperCase()}${o.molecule.slice(1)} (${o.route === "oral" ? "pill" : "injection"})`;

export default function Results(props: {
  matrix: ClaimMatrix;
  ranking: Ranking;
  onEdit: () => void;
  onRestart: () => void;
}) {
  const { matrix, ranking } = props;
  const dimLabel = (id: string) => matrix.dimensions.find((d) => d.id === id)?.label ?? id;
  const weights = ranking.ranked[0]?.dimensions ?? [];

  return (
    <section className="mt-8">
      <h1 className="text-2xl font-semibold tracking-tight">Your ranking</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Drug and brand names are shown now that your priorities are set. Scores reflect the evidence on what you said
        matters, weighted by how much you said it matters.
      </p>

      {weights.length > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-medium">How your priorities were weighted</h2>
          <ul className="mt-3 space-y-2">
            {[...weights]
              .sort((a, b) => b.weightShare - a.weightShare)
              .map((d) => (
                <li key={d.dimensionId} className="grid grid-cols-[1fr_3rem] items-center gap-3 text-sm">
                  <div>
                    <div className="text-zinc-700 dark:text-zinc-300">{dimLabel(d.dimensionId)}</div>
                    <Bar value={d.weightShare} className="bg-zinc-400 dark:bg-zinc-500" />
                  </div>
                  <span className="text-right tabular-nums">{pct(d.weightShare)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {ranking.ranked.length === 0 && (
        <p className="mt-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          No options fit your limits. Try relaxing your budget or injection preference.
        </p>
      )}

      <ol className="mt-8 space-y-6">
        {ranking.ranked.map((r) => (
          <OptionCard key={r.option.id} result={r} matrix={matrix} dimLabel={dimLabel} />
        ))}
      </ol>

      {ranking.excluded.length > 0 && (
        <div className="mt-10">
          <h2 className="font-medium">Set aside by your limits</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            {ranking.excluded.map((e) => (
              <li key={e.option.id}>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{title(e.option)}</span>
                {" "}({e.option.brands.join(", ")}): {e.reasons.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <button onClick={props.onEdit} className="rounded-lg border border-zinc-300 px-4 py-2 hover:border-teal-700 dark:border-zinc-700">
          Change my answers
        </button>
        <button onClick={props.onRestart} className="rounded-lg px-4 py-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          Start over
        </button>
      </div>
      <Disclaimer />
    </section>
  );
}

function OptionCard(props: { result: RankedOption; matrix: ClaimMatrix; dimLabel: (id: string) => string }) {
  const { result: r, matrix, dimLabel } = props;
  return (
    <li className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">#{r.rank}</div>
          <h3 className="text-xl font-semibold">{title(r.option)}</h3>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">Sold as {r.option.brands.join(", ")}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums">{Math.round(r.total * 100)}</div>
          <div className="text-xs text-zinc-500">match score / 100</div>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {r.dimensions.map((d) => (
          <DimensionRow key={d.dimensionId} d={d} label={dimLabel(d.dimensionId)} />
        ))}
      </ul>

      <Evidence result={r} matrix={matrix} dimLabel={dimLabel} />
    </li>
  );
}

function DimensionRow({ d, label }: { d: DimensionResult; label: string }) {
  return (
    <li className="text-sm">
      <div className="flex justify-between gap-3">
        <span>
          {label} <span className="text-zinc-500">· weighted {pct(d.weightShare)}</span>
        </span>
        <span className="tabular-nums">{d.insufficientEvidence ? "n/a" : Math.round(d.score * 100)}</span>
      </div>
      <Bar value={d.insufficientEvidence ? 0 : d.score} className="bg-teal-700" />
      <div className="mt-1 text-xs text-zinc-500">
        {d.insufficientEvidence
          ? "No reviewed evidence yet. Scored as neutral (50) so it neither helps nor hurts."
          : CONFIDENCE_LABEL[d.confidence]}
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
      return { id, dim: d.dimensionId, text: `${f.kind.replaceAll("_", " ")}: ${f.value} (as of ${f.as_of})`, src: source(f.source_id) };
    }),
  ]);
  if (!rows.length) return null;

  return (
    <details className="mt-5 text-sm">
      <summary className="cursor-pointer font-medium text-teal-800 dark:text-teal-400">
        Show evidence and sources ({rows.length})
      </summary>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{dimLabel(row.dim)}</div>
            <div>{row.text}</div>
            {row.src && (
              <div className="mt-1 text-xs text-zinc-500">
                <a href={row.src.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-teal-700">
                  {row.src.title}
                </a>{" "}
                · {row.src.year} · {FUNDING_LABEL[row.src.funding]}
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
    <div className="mt-1 h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div className={`h-2 rounded-full ${className}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}
