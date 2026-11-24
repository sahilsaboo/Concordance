"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" tabIndex={-1} className="page-container flex-1 py-14 focus:outline-none">
      <p className="label-caps text-xs text-muted">Something went wrong</p>
      <h1 className="mt-2 font-display text-5xl font-light tracking-tight">Sorry, this page didn&apos;t load</h1>
      <p className="mt-4 max-w-prose text-lg text-muted">
        Try again. Your answers are saved in this tab, so you shouldn&apos;t lose them.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" onClick={() => retry()} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
