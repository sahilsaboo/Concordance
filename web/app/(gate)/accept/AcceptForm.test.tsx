// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, expect, it } from "vitest";
import AcceptForm from "./AcceptForm";

afterEach(cleanup);

it("won't submit until the box is ticked, and shows an accessible error", async () => {
  const user = userEvent.setup();
  // Runs after React's handler (window is above the React root), so it sees whether React blocked it.
  const outcomes: boolean[] = [];
  const onSubmit = (e: Event) => {
    outcomes.push(!e.defaultPrevented); // true = would have been sent to the server
    e.preventDefault(); // jsdom can't navigate
  };
  window.addEventListener("submit", onSubmit);
  render(
    <main>
      <AcceptForm action="/api/accept" next="/compare" serverError={false} />
    </main>,
  );

  await user.click(screen.getByRole("button", { name: "Accept and continue" }));
  expect(outcomes).toEqual([false]); // blocked in the browser before reaching the server
  const summary = screen.getByRole("heading", { name: "There is a problem" }).parentElement!;
  await waitFor(() => expect(document.activeElement).toBe(summary));
  expect(document.title).toMatch(/^Error: /);
  const a11y = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  expect(a11y.violations.map((v) => v.id)).toEqual([]);

  await user.click(screen.getByRole("checkbox"));
  expect(screen.queryByText("There is a problem")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Accept and continue" }));
  expect(outcomes).toEqual([false, true]);
  window.removeEventListener("submit", onSubmit);
  const data = new FormData(document.querySelector("form")!);
  expect(data.get("acknowledge")).toBe("yes");
  expect(data.get("next")).toBe("/compare");
});

it("shows the error when the server rejected a no-JavaScript submission", () => {
  render(<AcceptForm action="/api/accept" next="/" serverError />);
  expect(screen.getByText("There is a problem")).toBeTruthy();
});
