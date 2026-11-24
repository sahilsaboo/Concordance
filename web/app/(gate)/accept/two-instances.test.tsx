// @vitest-environment jsdom
// Defensive: two instances of the notice form on one page (one hidden) must not interfere. IDs, labels,
// error links, and focus all have to act on the visible instance.
import { act, cleanup, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { afterEach, expect, it } from "vitest";
import AcceptForm from "./AcceptForm";

afterEach(cleanup);

function Notice({ testId }: { testId: string }) {
  return (
    <main data-testid={testId}>
      <div role="dialog" aria-label="Before you continue">
        <h1 tabIndex={-1} data-autofocus>
          Before you continue
        </h1>
        <AcceptForm action="/api/accept" next="/" serverError={false} />
      </div>
    </main>
  );
}

function Page({ firstHidden }: { firstHidden: boolean }) {
  return (
    <>
      <Activity mode={firstHidden ? "hidden" : "visible"}>
        <Notice testId="first" />
      </Activity>
      <Activity mode="visible">
        <Notice testId="second" />
      </Activity>
    </>
  );
}

const visibleIds = (root: HTMLElement) => [...root.querySelectorAll("[id]")].map((e) => e.id);

it("each instance gets its own IDs", async () => {
  const { container, rerender } = render(<Page firstHidden={false} />);
  await act(async () => rerender(<Page firstHidden />));
  const ids = visibleIds(container);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
});

it("clicking the visible label ticks the visible checkbox, not the hidden one", async () => {
  const user = userEvent.setup();
  const { getByTestId, rerender } = render(<Page firstHidden={false} />);
  await act(async () => rerender(<Page firstHidden />));
  const visible = getByTestId("second");
  const hidden = getByTestId("first");

  await user.click(within(visible).getByText(/I understand that Concordance/));
  expect((visible.querySelector("input[type=checkbox]") as HTMLInputElement).checked).toBe(true);
  expect((hidden.querySelector("input[type=checkbox]") as HTMLInputElement).checked).toBe(false);
});

