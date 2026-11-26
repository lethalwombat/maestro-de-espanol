import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackForm } from "./feedback-form";
import type { FeedbackResponse } from "./schema";

/** A fetch that answers only when `respond` is called. */
function deferredApi() {
  let respond: (body: FeedbackResponse, status?: number) => void = () => undefined;
  const pending = new Promise<Response>((resolve) => {
    respond = (body, status = 200) => {
      resolve(Response.json(body, { status }));
    };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => pending),
  );
  return (body: FeedbackResponse, status?: number) => {
    respond(body, status);
  };
}

async function submit(sentence: string) {
  const user = userEvent.setup();
  const view = render(<FeedbackForm />);
  await user.type(screen.getByLabelText("Write a sentence in Spanish"), sentence);
  await user.click(screen.getByRole("button", { name: "Check my sentence" }));
  return view;
}

const busy = (container: HTMLElement) => container.querySelector('[aria-busy="true"]');

describe("FeedbackForm states", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a spinner and a busy placeholder while checking, and drops both on a result", async () => {
    const respond = deferredApi();
    const { container } = await submit("Hola.");

    const button = screen.getByRole("button", { name: "Checking…" });
    expect(button).toBeDisabled();
    expect(within(button).getByTestId("spinner")).toBeInTheDocument();
    expect(busy(container)).not.toBeNull();

    respond({ feedback: { verdict: "correct", corrected: "Hola.", issues: [] } });

    expect(await screen.findByRole("status")).toHaveTextContent("¡Perfecto!");
    expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    expect(busy(container)).toBeNull();
  });

  it("drops the loading state when an error arrives", async () => {
    const respond = deferredApi();
    const { container } = await submit("Hola.");
    expect(busy(container)).not.toBeNull();

    respond({ error: "busy", message: "The tutor is busy right now." }, 503);

    expect(await screen.findByRole("alert")).toHaveTextContent("The tutor is busy right now.");
    await waitFor(() => {
      expect(busy(container)).toBeNull();
    });
    expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
  });

  it("strikes each wrong fragment in the danger colour and shows its correction in the success colour, in a card", async () => {
    const respond = deferredApi();
    await submit("Yo es estudiante.");
    respond({
      feedback: {
        verdict: "has_errors",
        corrected: "Yo soy estudiante.",
        issues: [{ original: "es", correction: "soy", explanation: "With 'yo', ser is 'soy'." }],
      },
    });

    const corrections = await screen.findByRole("list", { name: "Corrections" });
    const wrong = within(corrections).getByText("es");
    const right = within(corrections).getByText("soy");
    expect(wrong.tagName).toBe("DEL");
    expect(wrong).toHaveClass("text-danger");
    expect(right.tagName).toBe("INS");
    expect(right).toHaveClass("text-success");
    expect(screen.getByRole("status")).toHaveClass("bg-surface");
  });

  it.each([
    ["a correct sentence", "correct", "status", "lucide-circle-check", "¡Perfecto!"],
    [
      "text that isn't Spanish",
      "not_spanish",
      "status",
      "lucide-info",
      "doesn't look like Spanish",
    ],
  ] as const)("gives %s its own message and icon", async (_name, verdict, role, icon, words) => {
    const respond = deferredApi();
    await submit("Hola.");
    respond({ feedback: { verdict, corrected: "", issues: [] } });

    const message = await screen.findByRole(role);
    expect(message).toHaveTextContent(words);
    expect(message.querySelector("svg")).toHaveClass(icon);
    expect(message.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("gives a failure an alert with an alert icon", async () => {
    const respond = deferredApi();
    await submit("Hola.");
    respond({ error: "busy", message: "The tutor is busy right now." }, 503);

    const alert = await screen.findByRole("alert");
    expect(alert.querySelector("svg")).toHaveClass("lucide-circle-alert");
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
