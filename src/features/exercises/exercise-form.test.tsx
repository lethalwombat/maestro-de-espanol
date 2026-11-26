import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExerciseForm } from "./exercise-form";
import type { Exercise, ExerciseResponse } from "./schema";

const EXERCISE: Exercise = {
  title: "Por y para",
  instructions: "Choose por or para.",
  items: [1, 2, 3, 4, 5].map((n) => ({
    type: "multiple_choice" as const,
    prompt: `Frase ${String(n)}: Gracias ___ todo.`,
    options: ["por", "para"],
    correct_option: 0,
    explanation: "Gratitude takes por.",
  })),
};

function stubApi(body: unknown, status = 200) {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json(body, { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setup() {
  const user = userEvent.setup();
  render(<ExerciseForm />);
  const topic = screen.getByRole("textbox", { name: "Topic" });
  const create = screen.getByRole("button", { name: "Create exercise" });
  return { user, topic, create };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExerciseForm", () => {
  it.each([
    ["empty", "", "Name a topic first."],
    ["whitespace only", "    ", "Name a topic first."],
    ["over 200 characters", "a".repeat(201), "Keep the topic under 200 characters."],
  ])(
    "shows a validation message for a topic that is %s and sends no request",
    async (_name, value, message) => {
      const fetchMock = stubApi({});
      const { user, topic, create } = setup();
      if (value) await user.type(topic, value);
      await user.click(create);

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(topic).toHaveAttribute("aria-invalid", "true");
      expect(topic).toHaveAccessibleDescription(message);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("sends the topic and renders the exercise", async () => {
    const fetchMock = stubApi({ exercise: EXERCISE } satisfies ExerciseResponse);
    const { user, topic, create } = setup();
    await user.type(topic, "por y para");
    await user.click(create);

    expect(await screen.findByRole("heading", { name: "Por y para" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/exercises",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ topic: "por y para" }) }),
    );
    expect(topic).not.toHaveAttribute("aria-invalid");
  });

  it("disables the button and shows a busy placeholder while generating, until the exercise arrives", async () => {
    let resolve: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const { user, topic } = setup();
    await user.type(topic, "food");
    await user.click(screen.getByRole("button", { name: "Create exercise" }));

    const busy = screen.getByRole("button", { name: "Creating…" });
    expect(busy).toBeDisabled();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    resolve(Response.json({ exercise: EXERCISE }));
    expect(await screen.findByRole("heading", { name: "Por y para" })).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Create exercise" })).toBeEnabled();
  });

  it("shows an info message for an off-topic topic and renders no exercise", async () => {
    stubApi({ off_topic: true });
    const { user, topic, create } = setup();
    await user.type(topic, "Python decorators");
    await user.click(create);

    const message = await screen.findByRole("status");
    expect(message).toHaveTextContent(/isn't about the Spanish language/);
    expect(screen.queryByRole("list", { name: "Items" })).not.toBeInTheDocument();
  });

  it("shows the API's error message in an alert and keeps the topic", async () => {
    stubApi(
      { error: "busy", message: "The tutor is busy right now. Please try again in a moment." },
      503,
    );
    const { user, topic, create } = setup();
    await user.type(topic, "food");
    await user.click(create);

    expect(await screen.findByRole("alert")).toHaveTextContent("The tutor is busy right now.");
    expect(topic).toHaveValue("food");
  });

  it.each([
    ["a response that fails the browser-side schema", () => stubApi({ exercise: { title: "x" } })],
    [
      "a network failure",
      () =>
        vi.stubGlobal(
          "fetch",
          vi.fn(() => Promise.reject(new TypeError("offline"))),
        ),
    ],
  ])("shows an error alert for %s, never a half-rendered exercise", async (_name, stub) => {
    stub();
    const { user, topic, create } = setup();
    await user.type(topic, "food");
    await user.click(create);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the tutor/i);
    expect(screen.queryByRole("list", { name: "Items" })).not.toBeInTheDocument();
    expect(topic).toHaveValue("food");
  });

  it("New exercise clears the exercise and returns focus to the topic, sending nothing", async () => {
    const fetchMock = stubApi({ exercise: EXERCISE });
    const { user, topic, create } = setup();
    await user.type(topic, "por y para");
    await user.click(create);
    await user.click(await screen.findByRole("button", { name: "Check answers" }));
    await user.click(screen.getByRole("button", { name: "New exercise" }));

    expect(topic).toHaveFocus();
    expect(topic).toHaveValue("por y para");
    expect(screen.queryByRole("list", { name: "Items" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
