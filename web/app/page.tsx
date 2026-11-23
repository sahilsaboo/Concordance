import Link from "next/link";
import { loadMatrix } from "@/lib/matrix";
import { Disclaimer, SampleBanner } from "@/components/Notices";

export default function Home() {
  const m = loadMatrix();
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Concordance</h1>
      <p className="mt-3 text-lg text-muted">
        Compare GLP-1 medications on independent, bias-rated, cited evidence, ranked by what matters to you.
      </p>
      <ul className="mt-8 space-y-3 text-foreground">
        <li>
          <strong>Brand-blind.</strong> You set your priorities before you see any drug or brand names.
        </li>
        <li>
          <strong>Evidence-weighted.</strong> Every claim is rated for bias and thoroughness, and stronger evidence
          counts more.
        </li>
        <li>
          <strong>Fully cited.</strong> Every result links to its sources.
        </li>
        <li>
          <strong>Private.</strong> Your answers stay in your browser and are never sent or stored.
        </li>
      </ul>
      <Link
        href="/compare"
        className="mt-10 inline-block rounded-lg bg-primary px-6 py-3 font-medium text-on-primary hover:bg-primary-hover"
      >
        Start comparing (about 2 minutes)
      </Link>
      {m.meta.is_sample && <SampleBanner note={m.meta.note} />}
      <Disclaimer />
    </main>
  );
}
