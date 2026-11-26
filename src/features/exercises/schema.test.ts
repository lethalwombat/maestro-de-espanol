import { describe, expect, it } from "vitest";
import { ExerciseOutputSchema, ExerciseRequestSchema, MAX_TOPIC_LENGTH } from "./schema";

const mc = (overrides: Record<string, unknown> = {}) => ({
  type: "multiple_choice",
  prompt: "Ayer ___ al cine.",
  options: ["fui", "iba"],
  correct_option: 0,
  explanation: "A single completed action takes the preterite.",
  ...overrides,
});

const blank = (overrides: Record<string, unknown> = {}) => ({
  type: "fill_blank",
  sentence: "Cuando era niño, ___ al parque cada día.",
  answer: "iba",
  alternatives: [],
  explanation: "A repeated past habit takes the imperfect.",
  ...overrides,
});

const exercise = (items: unknown[]) => ({
  on_topic: true,
  exercise: {
    title: "Preterite vs imperfect",
    instructions: "Choose or write the right past tense.",
    items,
  },
});

const fiveItems = () => [mc(), blank(), mc(), blank(), mc()];

describe("ExerciseOutputSchema", () => {
  it("accepts a mixed exercise of 5 to 10 items", () => {
    expect(ExerciseOutputSchema.safeParse(exercise(fiveItems())).success).toBe(true);
    expect(ExerciseOutputSchema.safeParse(exercise([...fiveItems(), ...fiveItems()])).success).toBe(
      true,
    );
  });

  it("accepts a fill-in-the-blank item without alternatives", () => {
    const item = blank();
    delete (item as Record<string, unknown>).alternatives;
    expect(ExerciseOutputSchema.safeParse(exercise([item, mc(), mc(), mc(), mc()])).success).toBe(
      true,
    );
  });

  it.each([
    ["4 items", exercise(fiveItems().slice(0, 4))],
    ["11 items", exercise([...fiveItems(), ...fiveItems(), mc()])],
    ["1 option", exercise([mc({ options: ["fui"] }), ...fiveItems().slice(1)])],
    ["5 options", exercise([mc({ options: ["a", "b", "c", "d", "e"] }), ...fiveItems().slice(1)])],
    [
      "a correct option out of range",
      exercise([mc({ correct_option: 2 }), ...fiveItems().slice(1)]),
    ],
    ["a negative correct option", exercise([mc({ correct_option: -1 }), ...fiveItems().slice(1)])],
    ["duplicate options", exercise([mc({ options: ["fui", "fui"] }), ...fiveItems().slice(1)])],
    [
      "a sentence with no blank",
      exercise([blank({ sentence: "Iba al parque." }), ...fiveItems().slice(1)]),
    ],
    [
      "a sentence with two blanks",
      exercise([blank({ sentence: "___ y ___." }), ...fiveItems().slice(1)]),
    ],
    ["an empty answer", exercise([blank({ answer: " " }), ...fiveItems().slice(1)])],
    ["an empty explanation", exercise([mc({ explanation: "" }), ...fiveItems().slice(1)])],
    ["an unknown item type", exercise([mc({ type: "translate" }), ...fiveItems().slice(1)])],
    [
      "an empty title",
      { on_topic: true, exercise: { ...exercise(fiveItems()).exercise, title: "" } },
    ],
    ["on topic with no exercise", { on_topic: true, exercise: null }],
    ["off topic with an exercise", { ...exercise(fiveItems()), on_topic: false }],
  ])("rejects %s", (_name, value) => {
    expect(ExerciseOutputSchema.safeParse(value).success).toBe(false);
  });

  it("accepts an off-topic decline with no exercise", () => {
    expect(ExerciseOutputSchema.safeParse({ on_topic: false, exercise: null }).success).toBe(true);
  });
});

describe("ExerciseRequestSchema", () => {
  it("trims the topic", () => {
    expect(ExerciseRequestSchema.parse({ topic: "  por y para " })).toEqual({
      topic: "por y para",
    });
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   \n "],
    ["over the limit", "a".repeat(MAX_TOPIC_LENGTH + 1)],
  ])("rejects a topic that is %s", (_name, topic) => {
    expect(ExerciseRequestSchema.safeParse({ topic }).success).toBe(false);
  });

  it("accepts a topic at the limit", () => {
    expect(ExerciseRequestSchema.safeParse({ topic: "a".repeat(MAX_TOPIC_LENGTH) }).success).toBe(
      true,
    );
  });
});
