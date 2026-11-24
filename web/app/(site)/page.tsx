import Link from "next/link";
import { loadMatrix } from "@/lib/matrix";
import { SampleBanner } from "@/components/Notices";

const POINTS = [
  { title: "You choose what matters", body: "Rate what's important to you before you see any drug or brand names." },
  { title: "Evidence is weighed fairly", body: "Each claim is rated for bias and quality. Stronger evidence counts more." },
  { title: "Every claim is cited", body: "Results link to the studies and sources behind them." },
  { title: "Your answers stay private", body: "Nothing you enter leaves your device." },
];

const STEPS = [
  { title: "Rate what matters", body: "Weight loss, side effects, heart health, convenience, and cost." },
  { title: "Set your limits", body: "Your budget, and whether injections are okay for you." },
  { title: "See ranked, cited results", body: "Brand names appear only now, with every source linked." },
];

export default function Home() {
  const m = loadMatrix();
  return (
    <>
      {m.meta.is_sample && <SampleBanner />}

      <div className="mt-10 grid items-center gap-10 lg:mt-14 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="label-caps text-xs text-muted">Independent GLP-1 comparison</p>
          <h1 className="mt-4 font-display text-5xl leading-[1.05] font-light tracking-tight sm:text-6xl lg:text-7xl">
            Compare GLP-1 medicines on evidence, not ads
          </h1>
          <p className="mt-6 max-w-prose text-lg leading-relaxed text-muted">
            Answer a few questions about what matters to you. We rank the options using independent, cited research, so
            you can have a better-informed conversation with your clinician.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
            <Link href="/compare" className="btn-primary">
              Start comparing
            </Link>
            <p className="text-sm text-muted">Takes about 2 minutes. No sign-up.</p>
          </div>
        </div>

        <section aria-labelledby="steps-title" className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <h2 id="steps-title" className="label-caps text-xs font-semibold">
            Three short steps
          </h2>
          <ol className="mt-6 space-y-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full bg-notice-bg font-display text-xl text-notice-text"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-2xl leading-tight">{s.title}</h3>
                  <p className="mt-1 leading-relaxed text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <h2 className="label-caps mt-20 text-xs font-semibold">Why Concordance</h2>
      <ul className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map((p) => (
          <li key={p.title} className="border-t border-line pt-5">
            <h3 className="font-display text-2xl leading-tight">{p.title}</h3>
            <p className="mt-2 leading-relaxed text-muted">{p.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-10">
        <Link href="/methodology" className="nav-link">
          Read how we rate and rank evidence
        </Link>
      </p>
    </>
  );
}
