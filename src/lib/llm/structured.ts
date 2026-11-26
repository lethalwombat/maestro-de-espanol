import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { LLM_CONFIG, type LlmConfig } from "./config";

export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  user: string;
  schema: S;
  /** For eval sweeps only. App code always runs on LLM_CONFIG. */
  overrides?: Partial<Pick<LlmConfig, "model" | "effort">>;
}

export type StructuredFailureReason = "refused" | "truncated" | "invalid_output";

export type StructuredResult<T> =
  | { ok: true; data: T; message: BetaMessage }
  | {
      ok: false;
      reason: StructuredFailureReason;
      /** Refusal category when reason is "refused" (e.g. "cyber"), otherwise null. */
      category: string | null;
      detail: string;
      message: BetaMessage;
    };

/**
 * One Claude call that must return JSON matching `schema`.
 *
 * The stop reason is checked before the content is read: a refusal or a response
 * cut off at max_tokens can carry partial text that isn't valid output. Each
 * failure comes back as a typed result, never as an exception. API and network
 * errors (rate limits, 5xx, timeouts) still throw `Anthropic.APIError`
 * subclasses, after the SDK's own retries.
 */
export async function requestStructured<S extends z.ZodType>(
  client: Anthropic,
  request: StructuredRequest<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const config = { ...LLM_CONFIG, ...request.overrides };

  const message = await client.beta.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    betas: config.betas,
    fallbacks: config.fallbacks,
    // Cached when the prefix is long enough; below the minimum it is a no-op.
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: request.user }],
    output_config: { effort: config.effort, format: betaZodOutputFormat(request.schema) },
  });

  const fail = (reason: StructuredFailureReason, detail: string, category: string | null = null) =>
    ({ ok: false, reason, category, detail, message }) as const;

  if (message.stop_reason === "refusal") {
    return fail(
      "refused",
      "The model declined the request.",
      message.stop_details?.category ?? null,
    );
  }
  if (message.stop_reason === "max_tokens") {
    return fail("truncated", `Output hit max_tokens (${config.maxTokens}).`);
  }

  const text = message.content.find((block) => block.type === "text")?.text;
  if (text === undefined) {
    return fail("invalid_output", "Response contained no text block.");
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail("invalid_output", "Response text was not valid JSON.");
  }

  const parsed = request.schema.safeParse(json);
  if (!parsed.success) {
    return fail("invalid_output", z.prettifyError(parsed.error));
  }
  return { ok: true, data: parsed.data, message };
}
