import type { Metadata } from "next";
import Link from "next/link";
import { loadMatrix } from "@/lib/matrix";
import { SampleBanner } from "@/components/Notices";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Concordance rates evidence for bias and quality, and how it ranks GLP-1 options against your priorities.",
};

const SECTIONS = [
  { id: "brand-blind", label: "Brand-blind choices" },
  { id: "evidence", label: "How claims are rated" },
  { id: "scoring", label: "How scores work" },
  { id: "limits", label: "What it doesn't do" },
  { id: "open", label: "Open and checkable" },
];

export default function MethodologyPage() {
  const m = loadMatrix();
  return (
    <>
      {m.meta.is_sample && <SampleBanner />}
      <div className="mt-8 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="On this page" className="hidden lg:sticky lg:top-8 lg:block lg:self-start">
          <p className="label-caps text-xs font-semibold">On this page</p>
          <ul className="mt-4 space-y-1 border-l border-line">
            {SECTIONS.map((sec) => (
              <li key={sec.id}>
                <a
                  href={`#${sec.id}`}
                  className="-ml-px block border-l-2 border-transparent py-2 pl-4 text-muted hover:border-primary hover:text-foreground"
                >
                  {sec.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="prose-page max-w-3xl">
          <p className="label-caps text-xs text-muted">Methodology</p>
          <h1 className="mt-2 font-display text-5xl font-light tracking-tight">How it works</h1>
          <p className="text-lg text-muted">
            Concordance ranks GLP-1 options against what you say matters, using evidence that has been rated for bias
            and quality. Here is exactly how.
          </p>

          <h2 id="brand-blind">1. You choose before you see brands</h2>
          <p>
            You rate your priorities and limits before any drug or brand name appears. This keeps advertising and
            familiarity from shaping your choices.
          </p>

          <h2 id="evidence">2. Every claim is rated</h2>
          <p>Each claim, such as how much weight people lost in a trial, gets two ratings from 0 to 1:</p>
          <ul>
            <li>
              <strong>Bias:</strong> how well the study protects against misleading results. This draws on the Cochrane
              Risk of Bias 2 domains, such as how patients were randomized and how outcomes were measured, plus who
              funded the study.
            </li>
            <li>
              <strong>Thoroughness:</strong> how complete and relevant the evidence is. This draws on GRADE: study size,
              length, how closely the people studied match you, and whether drugs were compared head to head.
            </li>
          </ul>
          <p>
            An AI model drafts each rating with the drug names hidden, and a person reviews every rating before it is
            used. Claims that have not been reviewed are never shown or scored.
          </p>
          <p>
            Prices and dosing come from drug labels and price sources. They are checked and dated, but not bias-rated,
            because they are facts rather than study results.
          </p>

          <h2 id="scoring">3. How scores are calculated</h2>
          <ul>
            <li>
              <strong>Evidence weight:</strong> each claim counts in proportion to its bias rating times its
              thoroughness rating. Stronger evidence counts more.
            </li>
            <li>
              <strong>Score for each priority (0 to 100):</strong> the weighted average of the claims for that option.
              It is an average, not a total, so an option does not score higher just because it has been studied more.
            </li>
            <li>
              <strong>Missing evidence:</strong> if there is no reviewed evidence for a priority, it counts as neutral
              (50) and is labeled. It neither helps nor hurts that option.
            </li>
            <li>
              <strong>Match score (0 to 100):</strong> each priority&apos;s score, weighted by how important you said it
              is. Your results show these weights.
            </li>
            <li>
              <strong>Your limits:</strong> options outside your budget, or injections if you chose pills only, are set
              aside rather than ranked lower. Your results list them and say why.
            </li>
          </ul>
          <p>The same answers always produce the same ranking. Nothing is personalized beyond what you enter.</p>

          <h2 id="limits">What Concordance doesn&apos;t do</h2>
          <ul>
            <li>It does not give medical advice or check whether a medicine is safe for you.</li>
            <li>It does not know your insurance coverage. Prices shown are cash prices.</li>
            <li>It only covers GLP-1 medicines for now.</li>
          </ul>

          <h2 id="open">Open and checkable</h2>
          <p>
            Every result links to its sources, and the code that rates and ranks evidence is{" "}
            <a href="https://github.com/sahilsaboo/Concordance">public on GitHub</a>.
          </p>

          <p className="mt-10 text-sm text-muted">Evidence last updated {m.meta.generated_at}.</p>
          <p className="mt-8">
            <Link href="/compare" className="btn-primary !no-underline">
              Start comparing
            </Link>
          </p>
        </article>
      </div>
    </>
  );
}
