import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="border-b border-line print:hidden">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="font-display text-2xl font-medium tracking-tight">
          Concordance
        </Link>
        <nav aria-label="Main">
          <Link href="/methodology" className="nav-link">
            How it works
          </Link>
        </nav>
      </div>
    </header>
  );
}
