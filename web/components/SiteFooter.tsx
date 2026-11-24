import Link from "next/link";

// Same links and disclaimer on every page (WCAG 2.2 3.2.6 Consistent Help).
export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="page-container flex flex-col gap-4 py-8 text-sm text-muted lg:flex-row lg:items-start lg:justify-between lg:gap-12">
        <p className="max-w-prose">
          <strong className="font-semibold text-foreground">Not medical advice.</strong> Concordance is for education
          only. Talk with a clinician before starting, stopping, or changing any medication.
        </p>
        <nav aria-label="Footer" className="flex shrink-0 flex-wrap gap-x-6 gap-y-2 print:hidden">
          <Link href="/methodology" className="nav-link">
            How it works
          </Link>
          <Link href="/privacy" className="nav-link">
            Privacy
          </Link>
          <a href="https://github.com/sahilsaboo/Concordance" className="nav-link">
            Source code
          </a>
        </nav>
      </div>
    </footer>
  );
}
