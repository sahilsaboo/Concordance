// Light/dark theme override. With no saved choice the site follows the device setting.
// The saved choice lives in localStorage (this browser only) and is applied before first paint by
// THEME_INIT_SCRIPT in app/layout.tsx, so there is no flash of the wrong theme.

export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "concordance:theme";
const THEME_EVENT = "concordance:themechange";

/** Runs inline in <head>, before the page paints. Keep it tiny and dependency-free. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function currentTheme(): Theme {
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "light" || forced === "dark") return forced;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the theme still changes for this page view.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** For useSyncExternalStore: re-render on toggle, or when the device setting changes. */
export function subscribeTheme(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
