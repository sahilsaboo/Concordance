import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export default function SiteHeader() {
  return (
    <header className="border-b border-line print:hidden">
      <div className="page-container flex items-center justify-between gap-4 py-4">
        <Link href="/" className="font-display text-2xl font-medium tracking-tight">
          Concordance
        </Link>
        <div className="flex items-center gap-3">
          <nav aria-label="Main">
            <Link href="/methodology" className="nav-link">
              How it works
            </Link>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
