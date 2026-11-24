import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="page-container flex-1 py-14 focus:outline-none">
      <p className="label-caps text-xs text-muted">Error 404</p>
      <h1 className="mt-2 font-display text-5xl font-light tracking-tight">Page not found</h1>
      <p className="mt-4 max-w-prose text-lg text-muted">If you typed the address, check it is correct.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn-primary">
          Go to the home page
        </Link>
        <Link href="/compare" className="btn-secondary">
          Start comparing
        </Link>
      </div>
    </main>
  );
}
