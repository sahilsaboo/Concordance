import Link from "next/link";
import { loadMatrix } from "@/lib/matrix";
import { SampleBanner } from "@/components/Notices";

const POINTS = [
  { title: "You choose what matters", body: "Rate what's important to you before you see any drug or brand names." },
  { title: "Evidence is weighed fairly", body: "Each claim is rated for bias and quality. Stronger evidence counts more." },
  { title: "Every claim is cited", body: "Results link to the studies and sources behind them." },
  { title: "Your answers stay private", body: "Nothing you enter leaves your device." },
];

export default function Home() {
  const m = loadMatrix();
  return (
    <>
      {m.meta.is_sample && <SampleBanner />}
      <p className="label-caps mt-8 text-xs text-muted">Independent GLP-1 comparison</p>
      <h1 className="mt-4 font-display text-5xl leading-[1.05] font-light tracking-tight sm:text-6xl">
        Compare GLP-1 medicines on evidence, not ads
      </h1>
      <p className="mt-5 text-lg leading-relaxed text-muted">
        Answer a few questions about what matters to you. We rank the options using independent, cited research, so
        you can have a better-informed conversation with your clinician.
      </p>
      <div className="mt-8 flex flex-col items-start gap-3">
        <Link href="/compare" className="btn-primary">
          Start comparing
        </Link>
        <p className="text-sm text-muted">Takes about 2 minutes. No sign-up.</p>
      </div>

      <h2 className="label-caps mt-14 text-xs font-semibold">How it works</h2>
      <ul className="mt-5 grid gap-6 sm:grid-cols-2">
        {POINTS.map((p) => (
          <li key={p.title} className="border-t border-line pt-4">
            <h3 className="font-display text-2xl">{p.title}</h3>
            <p className="mt-1 leading-relaxed text-muted">{p.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-8">
        <Link href="/methodology" className="nav-link">
          Read how we rate and rank evidence
        </Link>
      </p>
    </>
  );
}
