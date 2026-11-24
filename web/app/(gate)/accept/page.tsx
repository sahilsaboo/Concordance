import type { Metadata } from "next";
import { Suspense } from "react";
import { ACCEPT_API_PATH, safeNextPath } from "@/lib/consent";
import AcceptForm from "./AcceptForm";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Before you continue",
  description: "Concordance is for educational purposes only and is not medical advice.",
};

// The only page reachable without accepting (proxy.ts sends everyone here first).
// Deliberately no header, footer, or links: the only way forward is to accept.
export default function AcceptPage(props: PageProps<"/accept">) {
  return (
    <main id="main" tabIndex={-1} className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 focus:outline-none">
      <Backdrop />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ack-title"
        aria-describedby="ack-body"
        className="relative w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_80px_-20px_rgb(45_45_35/0.45)] sm:p-8"
      >
        {/* Inside the dialog: aria-modal hides everything outside it from screen readers. */}
        <div className="flex items-center justify-between gap-4">
          <p className="label-caps text-xs text-muted">Concordance</p>
          <ThemeToggle />
        </div>
        <h1 id="ack-title" tabIndex={-1} data-autofocus className="mt-2 font-display text-4xl font-light tracking-tight focus:outline-none">
          Before you continue
        </h1>
        <div id="ack-body" className="mt-4 space-y-3 leading-relaxed">
          <p className="text-lg font-medium">
            Concordance is for educational purposes only. It is not medical advice.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-muted">
            <li>It doesn&apos;t diagnose, treat, or recommend treatment for any condition.</li>
            <li>It doesn&apos;t know your health history, other medicines, or insurance.</li>
            <li>Always talk with a qualified clinician before starting, stopping, or changing any medication.</li>
            <li>If you think you may be having a medical emergency, call 911 or your local emergency number.</li>
          </ul>
        </div>
        <Suspense fallback={<AcceptForm action={ACCEPT_API_PATH} next="/" serverError={false} />}>
          <FormWithParams searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function FormWithParams({ searchParams }: { searchParams: PageProps<"/accept">["searchParams"] }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <AcceptForm action={ACCEPT_API_PATH} next={safeNextPath(one(sp.next))} serverError={one(sp.error) === "1"} />;
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
