"use client";

import { useId, useSyncExternalStore } from "react";
import { currentPreference, setPreference, subscribeTheme, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </>
    ),
  },
  { value: "dark", label: "Dark", icon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /> },
  {
    value: "system",
    label: "Auto (match device)",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>
    ),
  },
];

/**
 * Light / Dark / Auto switch. Native radio buttons, so arrow keys and screen readers work as expected.
 * Segments are 36px (above the 24px WCAG 2.2 minimum) so all three fit beside the logo on a phone.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const name = useId();
  // null on the server and during hydration (the saved choice isn't known there), then the real value.
  const pref = useSyncExternalStore<ThemePreference | null>(subscribeTheme, currentPreference, () => null);

  return (
    <fieldset
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-surface p-0.5 print:hidden ${className}`}
    >
      <legend className="sr-only">Color theme</legend>
      {OPTIONS.map((o) => (
        <label
          key={o.value}
          title={o.label}
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:text-foreground has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={pref === o.value}
            onChange={() => setPreference(o.value)}
            className="sr-only"
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {o.icon}
          </svg>
          <span className="sr-only">{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
