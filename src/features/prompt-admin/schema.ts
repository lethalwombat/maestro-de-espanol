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

export const SaveRequestSchema = z.object({ text: z.string() });
export const RestoreRequestSchema = z.object({ id: z.string().min(1) });

export const AdminStateSchema = z.object({
  active: z.discriminatedUnion("source", [
    z.object({ source: z.literal("default"), text: z.string() }),
    z.object({
      source: z.literal("saved"),
      id: z.string(),
      text: z.string(),
      savedAt: z.iso.datetime(),
    }),
  ]),
  versions: z.array(z.object({ id: z.string(), savedAt: z.iso.datetime(), firstLine: z.string() })),
});

export type AdminState = z.infer<typeof AdminStateSchema>;

export const ADMIN_ERROR_CODES = ["invalid_request", "not_found", "unavailable"] as const;

/** Body of every /api/admin/prompts response, validated by the browser too. */
export const AdminResponseSchema = z.union([
  AdminStateSchema,
  z.object({ error: z.enum(ADMIN_ERROR_CODES), message: z.string() }),
]);

export type AdminResponse = z.infer<typeof AdminResponseSchema>;
