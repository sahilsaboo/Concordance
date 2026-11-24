// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";
import ThemeToggle from "./ThemeToggle";

function mockSystemTheme(dark: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
  mockSystemTheme(false);
});
afterEach(cleanup);

describe("ThemeToggle", () => {
  it("follows the device setting until the user chooses", () => {
    mockSystemTheme(true);
    render(<ThemeToggle />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Switch to light mode");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("switches theme, saves the choice, and updates its label", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: "Switch to dark mode" });

    await user.click(button);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(button.getAttribute("aria-label")).toBe("Switch to light mode");

    await user.click(button);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});

describe("theme init script (runs before first paint)", () => {
  it("applies a saved choice", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("ignores missing or unexpected values", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
