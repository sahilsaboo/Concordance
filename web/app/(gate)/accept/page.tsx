import type { Metadata } from "next";
import { ACCEPT_API_PATH, safeNextPath } from "@/lib/consent";
import AcceptForm from "./AcceptForm";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Before you continue",
  description: "Concordance is for educational purposes only and is not medical advice.",
};

// Render this page in one pass after reading the URL, with no placeholder streamed first. A Suspense fallback
// here showed a second copy of the form that always sent people to "/" and hid the error; without JavaScript
// that placeholder was the only form anyone could see. Opting out of instant-navigation validation is the
// documented way to let a page wait for its URL parameters. Every visit here is a server redirect anyway.
export const instant = false;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// The only page reachable without accepting (proxy.ts sends everyone here first).
// Deliberately no header, footer, or links: the only way forward is to accept.
export default async function AcceptPage(props: PageProps<"/accept">) {
  const sp = await props.searchParams;
  const titleId = "ack-title";
  const bodyId = "ack-body";
  return (
    <main
      id="main"
      tabIndex={-1}
      className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 focus:outline-none"
    >
      <Backdrop />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_80px_-20px_rgb(45_45_35/0.45)] sm:p-8"
      >
        {/* Inside the dialog: aria-modal hides everything outside it from screen readers. */}
        <ThemeToggle className="absolute top-3 right-3" />
        <p className="label-caps text-xs text-muted">Concordance</p>
        <h1
          id={titleId}
          tabIndex={-1}
          data-autofocus
          className="mt-2 font-display text-4xl font-light tracking-tight focus:outline-none"
        >
          Before you continue
        </h1>
        <div id={bodyId} className="mt-4 space-y-3 leading-relaxed">
          <p className="text-lg font-medium">Concordance is for educational purposes only. It is not medical advice.</p>
          <ul className="list-disc space-y-2 pl-5 text-muted">
            <li>It doesn&apos;t diagnose, treat, or recommend treatment for any condition.</li>
            <li>It doesn&apos;t know your health history, other medicines, or insurance.</li>
            <li>Always talk with a qualified clinician before starting, stopping, or changing any medication.</li>
            <li>If you think you may be having a medical emergency, call 911 or your local emergency number.</li>
          </ul>
        </div>
        <AcceptForm action={ACCEPT_API_PATH} next={safeNextPath(one(sp.next))} serverError={one(sp.error) === "1"} />
      </div>
    </main>
  );
}

/** Decorative arches from the palette, standing in for the page behind the dialog (no real content leaks). */
function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60 blur-[2px]">
      <div className="absolute -top-16 -left-10 h-72 w-56 rounded-t-full bg-blanket" />
      <div className="absolute top-24 right-[-3rem] h-80 w-60 rounded-b-full bg-oak/70" />
      <div className="absolute bottom-[-4rem] left-[12%] h-64 w-64 rounded-tr-full bg-moss/60" />
      <div className="absolute right-[18%] bottom-[-5rem] h-72 w-52 rounded-t-full bg-mushroom" />
    </div>
  );
}
