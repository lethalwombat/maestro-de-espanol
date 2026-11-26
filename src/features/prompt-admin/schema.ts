import { z } from "zod";

export const MAX_PROMPT_LENGTH = 20_000;

export const PromptTextSchema = z
  .string()
  .trim()
  .min(1, "Write a prompt first.")
  .max(
    MAX_PROMPT_LENGTH,
    `Keep the prompt under ${MAX_PROMPT_LENGTH.toLocaleString("en-AU")} characters.`,
  );

export const PromptVersionSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  savedAt: z.iso.datetime(),
});

export type PromptVersion = z.infer<typeof PromptVersionSchema>;
