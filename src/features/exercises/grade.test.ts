import { describe, expect, it } from "vitest";
import { gradeExercise, gradeFillBlank, normaliseAnswer } from "./grade";
import type { Exercise, FillBlankItem } from "./schema";

const blank = (answer: string, alternatives: string[] = []): FillBlankItem => ({
  type: "fill_blank",
  sentence: "Mi hermano ___ en casa.",
  answer,
  alternatives,
  explanation: "Location takes estar.",
});

describe("normaliseAnswer", () => {
  it("trims, collapses spaces, lowercases and drops ¿ and ¡", () => {
    expect(normaliseAnswer("  ¿Dónde   ESTÁ?  ")).toBe("dónde está?");
    expect(normaliseAnswer("¡Hola!")).toBe("hola!");
  });
});

describe("gradeFillBlank", () => {
  it("marks the expected answer right", () => {
    expect(gradeFillBlank(blank("está"), "está")).toEqual({ correct: true, accentNote: null });
  });

  it("ignores case, surrounding and repeated spaces, and ¿ ¡", () => {
    expect(gradeFillBlank(blank("se fue"), "  SE   fue ").correct).toBe(true);
    expect(gradeFillBlank(blank("¿qué?"), "Qué?").correct).toBe(true);
    expect(gradeFillBlank(blank("¡vamos!"), "vamos!").correct).toBe(true);
  });

  it("accepts an alternative answer", () => {
    expect(gradeFillBlank(blank("he comido", ["comí"]), "Comí").correct).toBe(true);
  });

  it("marks a different word wrong", () => {
    expect(gradeFillBlank(blank("está"), "es")).toEqual({ correct: false, accentNote: null });
  });

  it("marks an empty or missing answer wrong", () => {
    expect(gradeFillBlank(blank("está"), "   ").correct).toBe(false);
    expect(gradeFillBlank(blank("está"), undefined).correct).toBe(false);
  });

  it("marks an answer that differs only by accents right, with the accented form", () => {
    expect(gradeFillBlank(blank("está"), "esta")).toEqual({ correct: true, accentNote: "está" });
    expect(gradeFillBlank(blank("pingüino"), "pinguino")).toEqual({
      correct: true,
      accentNote: "pingüino",
    });
  });

  it("flags a wrongly placed accent too", () => {
    expect(gradeFillBlank(blank("está"), "ésta")).toEqual({ correct: true, accentNote: "está" });
  });

  it("names the alternative whose accents were missed", () => {
    expect(gradeFillBlank(blank("he comido", ["comí"]), "comi")).toEqual({
      correct: true,
      accentNote: "comí",
    });
  });

  it("treats ñ as a different letter, not an accent", () => {
    expect(gradeFillBlank(blank("año"), "ano")).toEqual({ correct: false, accentNote: null });
  });
});

describe("gradeExercise", () => {
  const exercise: Exercise = {
    title: "Ser y estar",
    instructions: "Answer each item.",
    items: [
      {
        type: "multiple_choice",
        prompt: "Yo ___ de Chile.",
        options: ["soy", "estoy"],
        correct_option: 0,
        explanation: "Origin takes ser.",
      },
      blank("está"),
      {
        type: "multiple_choice",
        prompt: "La sopa ___ fría.",
        options: ["es", "está"],
        correct_option: 1,
        explanation: "A changeable state takes estar.",
      },
      blank("es"),
      blank("están"),
    ],
  };

  it("grades every item against the key and counts unanswered items as wrong", () => {
    const result = gradeExercise(exercise, [0, "esta", 0, undefined, "están"]);
    expect(result.results.map((item) => item.correct)).toEqual([true, true, false, false, true]);
    expect(result.results[1]?.accentNote).toBe("está");
    expect(result.score).toBe(3);
    expect(result.total).toBe(5);
  });

  it("reports the learner's answer and the correct answer for each item", () => {
    const result = gradeExercise(exercise, [1, "es", undefined, " ES ", "están"]);
    expect(result.results[0]).toMatchObject({ given: "estoy", expected: "soy", correct: false });
    expect(result.results[1]).toMatchObject({ given: "es", expected: "está", correct: false });
    expect(result.results[2]).toMatchObject({ given: null, expected: "está", correct: false });
    expect(result.results[3]).toMatchObject({ given: "ES", expected: "es", correct: true });
  });
});
