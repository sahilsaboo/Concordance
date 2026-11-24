// Light / Dark / Auto theme preference. "Auto" (the default) follows the device setting.
// A Light or Dark choice lives in localStorage (this browser only) and is applied before first paint by
// THEME_INIT_SCRIPT in app/layout.tsx, so there is no flash of the wrong theme. Choosing Auto clears it.

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";
export const THEME_STORAGE_KEY = "concordance:theme";
const THEME_EVENT = "concordance:themechange";

/** Runs inline in <head>, before the page paints. Keep it tiny and dependency-free. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function currentPreference(): ThemePreference {
  const forced = document.documentElement.getAttribute("data-theme");
  return forced === "light" || forced === "dark" ? forced : "system";
}

/** The theme actually showing (Auto resolved against the device setting). */
export function resolvedTheme(): Theme {
  const pref = currentPreference();
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setPreference(pref: ThemePreference): void {
  const root = document.documentElement;
  try {
    if (pref === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked: the theme still changes for this page view.
  }
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** For useSyncExternalStore: re-render on change here, in another tab, or in the device setting. */
export function subscribeTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    // Another tab changed it: mirror the change here.
    if (e.newValue === "light" || e.newValue === "dark") document.documentElement.setAttribute("data-theme", e.newValue);
    else document.documentElement.removeAttribute("data-theme");
    onChange();
  };
  media.addEventListener("change", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
