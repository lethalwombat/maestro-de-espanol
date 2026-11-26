import { z } from "zod";

export const MAX_SENTENCE_LENGTH = 500;

/** Body of POST /api/feedback. */
export const FeedbackRequestSchema = z.object({
  sentence: z
    .string()
    .trim()
    .min(1, "Write a sentence first.")
    .max(MAX_SENTENCE_LENGTH, `Keep it under ${MAX_SENTENCE_LENGTH} characters.`),
});

/** What Claude must return. The descriptions are part of the prompt. */
export const FeedbackSchema = z.object({
  verdict: z
    .enum(["correct", "has_errors", "not_spanish"])
    .describe(
      "correct: no errors. has_errors: at least one error. not_spanish: not an attempt at Spanish.",
    ),
  corrected: z
    .string()
    .describe(
      "The learner's sentence with every error fixed and nothing else changed. Identical to the input when the verdict is correct; empty when not_spanish.",
    ),
  issues: z
    .array(
      z.object({
        original: z
          .string()
          .describe("The exact fragment of the learner's sentence that is wrong."),
        correction: z.string().describe("What the fragment should be."),
        explanation: z
          .string()
          .describe("One or two sentences in English that name the rule, written for a learner."),
      }),
    )
    .describe("One entry per error. Empty unless the verdict is has_errors."),
});

export type Feedback = z.infer<typeof FeedbackSchema>;

export const FEEDBACK_ERROR_CODES = ["invalid_request", "refused", "unavailable", "busy"] as const;

export type FeedbackErrorCode = (typeof FEEDBACK_ERROR_CODES)[number];

/** Body of the response to POST /api/feedback, validated by the browser too. */
export const FeedbackResponseSchema = z.union([
  z.object({ feedback: FeedbackSchema }),
  z.object({ error: z.enum(FEEDBACK_ERROR_CODES), message: z.string() }),
]);

export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;
