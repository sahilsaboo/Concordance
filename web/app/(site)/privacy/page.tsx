import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Concordance does not collect your answers. Here is what happens to the information you enter.",
};

export default function PrivacyPage() {
  return (
    <article className="prose-page max-w-3xl">
      <p className="label-caps text-xs text-muted">Privacy</p>
      <h1 className="mt-2 font-display text-5xl font-light tracking-tight">Your answers stay with you</h1>
      <p className="text-lg text-muted">
        Concordance doesn&apos;t collect, send, or sell anything you enter. In short:
      </p>
      <ul>
        <li>Your answers and results are worked out on your own device. They are never sent to us or anyone else.</li>
        <li>
          Your answers are kept in this browser tab so they survive a page reload. They are deleted when you close the
          tab, or when you choose &quot;Start over and clear my answers.&quot;
        </li>
        <li>
          One cookie remembers that you accepted the &quot;educational use only&quot; notice, for 30 days. It contains
          only the date you accepted and the notice version, and isn&apos;t used for tracking.
        </li>
        <li>If you choose light or dark mode, that choice is saved in this browser so it stays the same next time.</li>
        <li>No accounts, no advertising, no tracking cookies, and no analytics.</li>
        <li>
          Like any website, our hosting provider may keep standard server logs, such as IP addresses and pages
          requested, for security and reliability. These never include your answers.
        </li>
      </ul>
      <h2>Links to sources</h2>
      <p>
        Results link to studies and other sources on outside websites. Those sites have their own privacy policies.
      </p>
    </article>
  );
}
