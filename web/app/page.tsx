import { loadMatrix } from "@/lib/matrix";

// Placeholder home page. Proves the app can read the claim matrix.
// Replaced by the questionnaire in milestone 2.
export default function Home() {
  const m = loadMatrix();
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 font-sans">
      <h1 className="text-3xl font-semibold tracking-tight">Concordance</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Compare GLP-1 options on independent, bias-rated, cited evidence.
      </p>
      {m.meta.is_sample && (
        <p className="mt-6 rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          {m.meta.note}
        </p>
      )}
      <ul className="mt-6 text-sm text-zinc-700 dark:text-zinc-300">
        <li>{m.options.length} options</li>
        <li>{m.dimensions.length} priorities</li>
        <li>{m.claims.length} reviewed claims</li>
        <li>{m.facts.length} facts</li>
      </ul>
    </main>
  );
}
