// @vitest-environment jsdom
// Automated accessibility checks (axe-core) on each questionnaire state.
// jsdom can't compute layout, so color contrast is checked separately (see globals.css notes).
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { loadMatrix } from "@/lib/matrix";
import Compare from "./Compare";

const matrix = loadMatrix();

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/compare");
  window.scrollTo = () => {};
});
afterEach(cleanup);

async function violations() {
  const r = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
}

it("has no axe violations on each step, including the error state", async () => {
  const user = userEvent.setup();
  render(
    <main>
      <Compare matrix={matrix} />
    </main>,
  );
  expect(await violations()).toEqual([]);

  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await violations()).toEqual([]);

  for (const d of matrix.dimensions) {
    await user.click(within(screen.getByRole("group", { name: d.label })).getByLabelText("Very"));
  }
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { level: 1, name: "Your practical limits" });
  expect(await violations()).toEqual([]);

  await user.click(screen.getByLabelText("No, pills only"));
  await user.click(screen.getByLabelText("Up to $500"));
  await user.click(screen.getByRole("button", { name: "See my results" }));
  await screen.findByRole("heading", { level: 1, name: "Your results" });
  expect(await violations()).toEqual([]);
});
