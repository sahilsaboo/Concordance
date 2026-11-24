// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMatrix } from "@/lib/matrix";
import Compare from "./Compare";

const matrix = loadMatrix();
const brands = matrix.options.flatMap((o) => o.brands);

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/compare");
  window.scrollTo = () => {};
});
afterEach(cleanup);

async function answerPriorities(user: ReturnType<typeof userEvent.setup>) {
  for (const d of matrix.dimensions) {
    const group = screen.getByRole("group", { name: d.label });
    await user.click(within(group).getByLabelText("Somewhat"));
  }
}

describe("Compare flow", () => {
  it("hides every brand name until results", () => {
    render(<Compare matrix={matrix} />);
    const text = document.body.textContent ?? "";
    for (const b of brands) expect(text).not.toContain(b);
  });

  it("shows an error summary instead of a disabled button, and focuses it", async () => {
    const user = userEvent.setup();
    render(<Compare matrix={matrix} />);
    const button = screen.getByRole("button", { name: "Continue" });
    expect((button as HTMLButtonElement).disabled).toBe(false);

    await user.click(button);

    const summary = screen.getByRole("heading", { name: "There is a problem" }).parentElement!;
    expect(within(summary).getAllByRole("link")).toHaveLength(matrix.dimensions.length);
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(document.title).toMatch(/^Error: /);
  });

  it("clears errors as questions are answered", async () => {
    const user = userEvent.setup();
    render(<Compare matrix={matrix} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await answerPriorities(user);
    expect(screen.queryByText("There is a problem")).toBeNull();
  });

  it("walks through to results, moving focus to each new heading", async () => {
    const user = userEvent.setup();
    render(<Compare matrix={matrix} />);
    await answerPriorities(user);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const limitsHeading = await screen.findByRole("heading", { level: 1, name: "Your practical limits" });
    await waitFor(() => expect(document.activeElement).toBe(limitsHeading));
    expect(window.location.search).toBe("?step=limits");

    await user.click(screen.getByLabelText("Yes, injections are fine"));
    await user.click(screen.getByLabelText("No limit or not sure"));
    await user.click(screen.getByRole("button", { name: "See my results" }));

    const resultsHeading = await screen.findByRole("heading", { level: 1, name: "Your results" });
    await waitFor(() => expect(document.activeElement).toBe(resultsHeading));
    expect(screen.getByText(/Best match for you|Tied best matches/)).toBeTruthy();
    expect(document.body.textContent).toContain(brands[0]);
  });

  it("saves answers in this tab so a reload keeps them", async () => {
    const user = userEvent.setup();
    render(<Compare matrix={matrix} />);
    await answerPriorities(user);
    const saved = JSON.parse(window.sessionStorage.getItem("concordance:draft:v1")!);
    expect(Object.keys(saved.importance)).toHaveLength(matrix.dimensions.length);
  });
});
