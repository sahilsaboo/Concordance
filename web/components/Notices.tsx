export function SampleBanner({ note }: { note?: string | null }) {
  return (
    <p className="mt-8 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      {note ?? "Sample data. Not real evidence."}
    </p>
  );
}

export function Disclaimer() {
  return (
    <p className="mt-8 text-xs text-zinc-500">
      Concordance is for education only and is not medical advice. Talk with a clinician before starting, stopping, or
      changing any medication.
    </p>
  );
}
