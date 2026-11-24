// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvedTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";
import ThemeToggle from "./ThemeToggle";

function mockSystemTheme(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const root = document.documentElement;

beforeEach(() => {
  root.removeAttribute("data-theme");
  window.localStorage.clear();
  mockSystemTheme(false);
});
afterEach(cleanup);

describe("Light / Dark / Auto switch", () => {
  it("starts on Auto, following the device setting", () => {
    mockSystemTheme(true);
    render(<ThemeToggle />);
    expect(radio("Auto (match device)").checked).toBe(true);
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(resolvedTheme()).toBe("dark");
  });

  it("Light and Dark override the device and are saved", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(radio("Dark"));
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(radio("Dark").checked).toBe(true);

    await user.click(radio("Light"));
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("Auto clears the saved choice and goes back to the device setting", async () => {
    const user = userEvent.setup();
    mockSystemTheme(true);
    render(<ThemeToggle />);
    await user.click(radio("Light"));
    expect(resolvedTheme()).toBe("light");

    await user.click(radio("Auto (match device)"));
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(resolvedTheme()).toBe("dark");
  });

  it("works with arrow keys like any radio group", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    radio("Auto (match device)").focus();
    await user.keyboard("{ArrowLeft}");
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("follows a change made in another tab", () => {
    render(<ThemeToggle />);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" }));
    });
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(radio("Dark").checked).toBe(true);
  });

  it("has no accessibility violations", async () => {
    render(<ThemeToggle />);
    const r = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

describe("theme init script (runs before first paint)", () => {
  it("applies a saved choice", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(root.getAttribute("data-theme")).toBe("dark");
  });

  it("ignores missing or unexpected values (Auto)", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    new Function(THEME_INIT_SCRIPT)();
    expect(root.hasAttribute("data-theme")).toBe(false);
  });
});
