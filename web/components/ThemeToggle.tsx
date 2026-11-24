"use client";

import { useSyncExternalStore } from "react";
import { currentTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  // null on the server and during hydration (the theme isn't known there), then the real value.
  const theme = useSyncExternalStore<Theme | null>(subscribeTheme, currentTheme, () => null);
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={theme ? `Switch to ${next} mode` : "Switch color theme"}
      title={theme ? `Switch to ${next} mode` : undefined}
      className={`inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-track print:hidden ${className}`}
    >
      {/* Icons are swapped by CSS from the actual theme, so the right one shows before hydration too. */}
      <svg aria-hidden="true" viewBox="0 0 24 24" className="theme-icon-moon size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
      </svg>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="theme-icon-sun size-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </svg>
    </button>
  );
}
