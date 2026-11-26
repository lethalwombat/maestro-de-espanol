import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackForm } from "./feedback-form";
import type { Feedback, FeedbackResponse } from "./schema";

function stubApi(body: FeedbackResponse, status = 200) {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(body, { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function submit(sentence: string) {
  const user = userEvent.setup();
  render(<FeedbackForm />);
  await user.type(screen.getByLabelText("Write a sentence in Spanish"), sentence);
  await user.click(screen.getByRole("button", { name: "Check my sentence" }));
}

describe("FeedbackForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the button disabled until there is something to check", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm />);
    const button = screen.getByRole("button", { name: "Check my sentence" });

    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Write a sentence in Spanish"), "   ");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Write a sentence in Spanish"), "Hola");
    expect(button).toBeEnabled();
  });

  it("sends the sentence and shows each correction with its explanation", async () => {
    const feedback: Feedback = {
      verdict: "has_errors",
      corrected: "Yo soy estudiante.",
      issues: [{ original: "es", correction: "soy", explanation: "With 'yo', ser is 'soy'." }],
    };
    const fetchMock = stubApi({ feedback });

    await submit("Yo es estudiante.");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sentence: "Yo es estudiante." }),
      }),
    );
    expect(await screen.findByText("Yo soy estudiante.")).toBeInTheDocument();
    const corrections = screen.getByRole("list", { name: "Corrections" });
    expect(within(corrections).getByText("es")).toBeInTheDocument();
    expect(within(corrections).getByText("soy")).toBeInTheDocument();
    expect(within(corrections).getByText("With 'yo', ser is 'soy'.")).toBeInTheDocument();
  });

  it("congratulates a correct sentence", async () => {
    stubApi({ feedback: { verdict: "correct", corrected: "Hola.", issues: [] } });

    await submit("Hola.");

    expect(await screen.findByRole("status")).toHaveTextContent("¡Perfecto!");
  });

  it("says so when the text isn't Spanish", async () => {
    stubApi({ feedback: { verdict: "not_spanish", corrected: "", issues: [] } });

    await submit("Hello there.");

    expect(await screen.findByRole("status")).toHaveTextContent("doesn't look like Spanish");
  });

  it("shows the server's message when the request fails", async () => {
    stubApi({ error: "busy", message: "The tutor is busy right now." }, 503);

    await submit("Hola.");

    expect(await screen.findByRole("alert")).toHaveTextContent("The tutor is busy right now.");
  });

  it("shows a connection error when the network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    await submit("Hola.");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the tutor");
  });

  it("treats an unexpected response body as a connection error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("<html>oops</html>"))),
    );

    await submit("Hola.");

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the tutor");
  });
});
