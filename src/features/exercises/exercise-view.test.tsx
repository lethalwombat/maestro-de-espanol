import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExerciseView } from "./exercise-view";
import type { Exercise } from "./schema";

const EXERCISE: Exercise = {
  title: "Ser y estar",
  instructions: "Choose or write the right verb.",
  items: [
    {
      type: "multiple_choice",
      prompt: "Yo ___ de Chile.",
      options: ["soy", "estoy"],
      correct_option: 0,
      explanation: "Origin takes ser.",
    },
    {
      type: "fill_blank",
      sentence: "Mi hermano ___ en casa.",
      answer: "está",
      alternatives: [],
      explanation: "Location takes estar.",
    },
    {
      type: "multiple_choice",
      prompt: "La sopa ___ fría.",
      options: ["es", "está"],
      correct_option: 1,
      explanation: "A changeable state takes estar.",
    },
    {
      type: "fill_blank",
      sentence: "Ella ___ médica.",
      answer: "es",
      explanation: "Professions take ser.",
    },
    {
      type: "fill_blank",
      sentence: "Nosotros ___ cansados.",
      answer: "estamos",
      explanation: "A temporary state takes estar.",
    },
  ],
};

function renderView(onNewExercise = vi.fn()) {
  render(<ExerciseView exercise={EXERCISE} onNewExercise={onNewExercise} />);
  return { onNewExercise, user: userEvent.setup() };
}

const items = () => within(screen.getByRole("list", { name: "Items" })).getAllByRole("listitem");

function item(index: number): HTMLElement {
  const found = items()[index];
  if (!found) throw new Error(`no item ${String(index)}`);
  return found;
}

describe("ExerciseView", () => {
  it("renders the title, instructions and items in order as named radio groups and labelled inputs", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 2, name: "Ser y estar" })).toBeInTheDocument();
    expect(screen.getByText("Choose or write the right verb.")).toBeInTheDocument();

    expect(items()).toHaveLength(5);
    expect(
      within(item(0)).getByRole("radiogroup", { name: /Yo ___ de Chile\./ }),
    ).toBeInTheDocument();
    expect(
      within(item(1)).getByRole("textbox", { name: /Mi hermano ___ en casa\./ }),
    ).toBeInTheDocument();
    expect(
      within(item(2)).getByRole("radiogroup", { name: /La sopa ___ fría\./ }),
    ).toBeInTheDocument();
    expect(within(item(3)).getByRole("textbox", { name: /Ella ___ médica\./ })).toBeInTheDocument();
  });

  it("is operable by keyboard alone", async () => {
    const { user } = renderView();
    await user.tab();
    expect(screen.getByRole("radio", { name: "soy" })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("radio", { name: "soy" })).toBeChecked();
    await user.tab();
    expect(screen.getByRole("textbox", { name: /Mi hermano/ })).toHaveFocus();
    await user.keyboard("está");
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "está" })).toBeChecked();
  });

  it("checks with unanswered items, counts them wrong, and reports the score", async () => {
    const { user } = renderView();
    // Answer out of order: the last item first, then the first.
    await user.type(screen.getByRole("textbox", { name: /Nosotros/ }), "estamos");
    await user.click(screen.getByRole("radio", { name: "soy" }));
    await user.click(screen.getByRole("button", { name: "Check answers" }));

    expect(screen.getByRole("status")).toHaveTextContent("2 of 5 right");
    const [first, second, , , last] = items();
    expect(first).toHaveTextContent("Right");
    expect(second).toHaveTextContent("Wrong");
    expect(second).toHaveTextContent("Your answer: no answer");
    expect(last).toHaveTextContent("Right");
  });

  it("shows right or wrong in words and a hidden icon, the answers and the explanation, and locks the answers", async () => {
    const { user } = renderView();
    await user.click(screen.getByRole("radio", { name: "estoy" }));
    await user.type(screen.getByRole("textbox", { name: /Ella/ }), "es");
    await user.click(screen.getByRole("button", { name: "Check answers" }));

    const first = item(0);
    const fourth = item(3);
    expect(first).toHaveTextContent("Wrong");
    expect(first).toHaveTextContent("Your answer: estoy");
    expect(first).toHaveTextContent("Correct answer: soy");
    expect(first).toHaveTextContent("Origin takes ser.");
    expect(first.querySelector("svg.lucide-circle-x")).toHaveAttribute("aria-hidden", "true");

    expect(fourth).toHaveTextContent("Right");
    expect(fourth).toHaveTextContent("Your answer: es");
    expect(fourth).not.toHaveTextContent("Correct answer");
    expect(fourth).toHaveTextContent("Professions take ser.");
    expect(fourth.querySelector("svg.lucide-circle-check")).toHaveAttribute("aria-hidden", "true");

    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    for (const input of screen.getAllByRole("textbox")) expect(input).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Check answers" })).not.toBeInTheDocument();
  });

  it("marks an answer right when only the accent is missing, and says to watch it", async () => {
    const { user } = renderView();
    await user.type(screen.getByRole("textbox", { name: /Mi hermano/ }), "esta");
    await user.click(screen.getByRole("button", { name: "Check answers" }));

    const second = item(1);
    expect(second).toHaveTextContent("Right");
    expect(second).toHaveTextContent("Watch the accent: está");
  });

  it("clears the answers and results with Try again", async () => {
    const { user } = renderView();
    await user.click(screen.getByRole("radio", { name: "soy" }));
    await user.type(screen.getByRole("textbox", { name: /Ella/ }), "es");
    await user.click(screen.getByRole("button", { name: "Check answers" }));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "soy" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "soy" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: /Ella/ })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: /Ella/ })).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Check answers" })).toBeInTheDocument();
  });

  it("hands New exercise to its parent", async () => {
    const { user, onNewExercise } = renderView();
    await user.click(screen.getByRole("button", { name: "Check answers" }));
    await user.click(screen.getByRole("button", { name: "New exercise" }));
    expect(onNewExercise).toHaveBeenCalledOnce();
  });
});
