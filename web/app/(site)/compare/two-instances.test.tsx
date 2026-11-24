// @vitest-environment jsdom
// Defensive: two instances of the questionnaire on one page (one hidden) must not interfere. IDs, labels,
// error links, and focus all have to act on the visible instance.
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { loadMatrix } from "@/lib/matrix";
import Compare from "./Compare";

const matrix = loadMatrix();

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/compare");
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {}; // not implemented in jsdom
});
afterEach(cleanup);

function Page({ firstHidden }: { firstHidden: boolean }) {
  return (
    <>
      <Activity mode={firstHidden ? "hidden" : "visible"}>
        <div data-testid="first">
          <Compare matrix={matrix} />
        </div>
      </Activity>
      <Activity mode="visible">
        <div data-testid="second">
          <Compare matrix={matrix} />
        </div>
      </Activity>
    </>
  );
}

async function renderWithHiddenCopy() {
  const utils = render(<Page firstHidden={false} />);
  await act(async () => utils.rerender(<Page firstHidden />));
  return { ...utils, visible: utils.getByTestId("second") };
}

it("each instance gets its own IDs", async () => {
  const { container } = await renderWithHiddenCopy();
  const ids = [...container.querySelectorAll("[id]")].map((e) => e.id);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
});

it("error summary links and focus stay in the visible copy", async () => {
  const user = userEvent.setup();
  const { visible } = await renderWithHiddenCopy();

  await user.click(within(visible).getByRole("button", { name: "Continue" }));
  const summary = within(visible).getByRole("heading", { name: "There is a problem" }).parentElement!;
  await waitFor(() => expect(document.activeElement).toBe(summary));

  const firstLink = within(summary).getAllByRole("link")[0];
  const target = document.querySelector(`[id="${firstLink.getAttribute("href")!.slice(1)}"]`);
  expect(visible.contains(target)).toBe(true); // the link's target is the visible question
  await user.click(firstLink);
  const focused = document.activeElement as HTMLInputElement;
  expect(focused.type).toBe("radio");
  expect(focused.name).toBe(matrix.dimensions[0].id);
  expect(visible.contains(focused)).toBe(true);
});

it("moves focus to the visible copy's next heading", async () => {
  const user = userEvent.setup();
  const { visible } = await renderWithHiddenCopy();
  for (const d of matrix.dimensions) {
    await user.click(within(within(visible).getByRole("group", { name: d.label })).getByLabelText("Very"));
  }
  await user.click(within(visible).getByRole("button", { name: "Continue" }));
  const heading = await within(visible).findByRole("heading", { level: 1, name: "Your practical limits" });
  await waitFor(() => expect(document.activeElement).toBe(heading));
});
