export function SampleBanner({ note }: { note?: string | null }) {
  return (
    <p className="mt-8 rounded-lg border border-notice-line bg-notice-bg p-3 text-sm text-notice-text">
      {note ?? "Sample data. Not real evidence."}
    </p>
  );
}

export function Disclaimer() {
  return (
    <p className="mt-8 text-xs text-muted">
      Concordance is for education only and is not medical advice. Talk with a clinician before starting, stopping, or
      changing any medication.
    </p>
  );
}
