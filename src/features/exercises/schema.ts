import { z } from "zod";

export const MAX_TOPIC_LENGTH = 200;
export const MIN_ITEMS = 5;
export const MAX_ITEMS = 10;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;

/** The blank in a fill-in-the-blank sentence: three or more underscores. */
export const BLANK = /_{3,}/g;

/** Body of POST /api/exercises. */
export const ExerciseRequestSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1, "Name a topic first.")
    .max(MAX_TOPIC_LENGTH, `Keep the topic under ${String(MAX_TOPIC_LENGTH)} characters.`),
});

const text = z.string().trim().min(1);

const explanation = text.describe(
  "One or two sentences in English, written for a learner, that say why the answer is right.",
);

// The structured-output grammar can't enforce array bounds, string lengths or
// cross-field rules: the SDK moves bounds into descriptions and drops
// refinements. requestStructured() re-validates with this schema, so a breach
// comes back as invalid_output and never reaches the page.

export const MultipleChoiceItemSchema = z
  .object({
    type: z.literal("multiple_choice"),
    prompt: text.describe("The question or sentence to complete, in Spanish where it helps."),
    options: z
      .array(text)
      .min(MIN_OPTIONS)
      .max(MAX_OPTIONS)
      .describe("2 to 4 distinct options. Exactly one is correct."),
    correct_option: z
      .number()
      .int()
      .min(0)
      .describe("Zero-based index into options of the one correct option."),
    explanation,
  })
  .refine((item) => item.correct_option < item.options.length, {
    error: "correct_option must point at one of the options.",
    path: ["correct_option"],
  })
  .refine(
    (item) =>
      new Set(item.options.map((option) => option.toLowerCase())).size === item.options.length,
    { error: "Options must be distinct.", path: ["options"] },
  );

export const FillBlankItemSchema = z
  .object({
    type: z.literal("fill_blank"),
    sentence: text.describe(
      "A Spanish sentence with exactly one blank, written as three underscores: ___",
    ),
    answer: text.describe("The expected answer for the blank, with correct accents."),
    alternatives: z
      .array(text)
      .optional()
      .describe("Other answers that are equally correct for the blank. Empty if there are none."),
    explanation,
  })
  .refine((item) => (item.sentence.match(BLANK) ?? []).length === 1, {
    error: "The sentence must have exactly one blank (___).",
    path: ["sentence"],
  });

export const ExerciseItemSchema = z.discriminatedUnion("type", [
  MultipleChoiceItemSchema,
  FillBlankItemSchema,
]);

export const ExerciseSchema = z.object({
  title: text.describe("A short title for the exercise."),
  instructions: text.describe(
    "One or two short sentences in English telling the learner what to do.",
  ),
  items: z
    .array(ExerciseItemSchema)
    .min(MIN_ITEMS)
    .max(MAX_ITEMS)
    .describe("5 to 10 items, mixing multiple choice and fill-in-the-blank as suits the topic."),
});

/** What Claude must return. The descriptions are part of the prompt. */
export const ExerciseOutputSchema = z
  .object({
    on_topic: z
      .boolean()
      .describe("true when the topic is about the Spanish language; false otherwise."),
    exercise: ExerciseSchema.nullable().describe(
      "The exercise when on_topic is true; null otherwise.",
    ),
  })
  .refine((output) => output.on_topic === (output.exercise !== null), {
    error: "exercise must be present exactly when on_topic is true.",
    path: ["exercise"],
  });

export type ExerciseOutput = z.infer<typeof ExerciseOutputSchema>;
export type Exercise = z.infer<typeof ExerciseSchema>;
export type ExerciseItem = z.infer<typeof ExerciseItemSchema>;
export type MultipleChoiceItem = z.infer<typeof MultipleChoiceItemSchema>;
export type FillBlankItem = z.infer<typeof FillBlankItemSchema>;

export const EXERCISE_ERROR_CODES = ["invalid_request", "refused", "unavailable", "busy"] as const;

export type ExerciseErrorCode = (typeof EXERCISE_ERROR_CODES)[number];

/** Body of the response to POST /api/exercises, validated by the browser too. */
export const ExerciseResponseSchema = z.union([
  z.object({ exercise: ExerciseSchema }),
  z.object({ off_topic: z.literal(true) }),
  z.object({ error: z.enum(EXERCISE_ERROR_CODES), message: z.string() }),
]);

export type ExerciseResponse = z.infer<typeof ExerciseResponseSchema>;
