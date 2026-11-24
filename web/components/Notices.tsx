const DEFAULT_NOTE =
  "Numbers, ratings, and sources are placeholders, not real evidence. Don't use these results to make health decisions.";

/** Shown while any part of the matrix is placeholder data. The matrix's own note says which parts. */
export function SampleBanner({ note }: { note?: string | null }) {
  return (
    <div role="note" className="rounded-lg border border-notice-line bg-notice-bg p-4 text-sm leading-relaxed text-notice-text">
      <strong className="font-semibold">Preview with partly sample data.</strong> {note || DEFAULT_NOTE}
    </div>
  );
}
