import type { AnthropicBeta } from "@anthropic-ai/sdk/resources/beta/beta";
import type { BetaFallbacksParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface LlmConfig {
  model: string;
  effort: Effort;
  maxTokens: number;
  betas: AnthropicBeta[];
  fallbacks: BetaFallbacksParam;
}

/**
 * The single place where model behaviour is configured. The app and the evals
 * both read this, so an eval measures exactly what ships.
 *
 * - Claude Opus 5.5 always thinks; `effort` sets how much (its default is medium).
 * - `fallbacks: "default"` lets the API re-run a policy-declined request on the
 *   fallback model Anthropic recommends for that refusal category, instead of
 *   failing the learner's request outright.
 *
 * Changing any of this is a product decision: re-run `npm run evals` before and after.
 */
export const LLM_CONFIG: LlmConfig = {
  model: "claude-opus-5-5",
  effort: "medium",
  maxTokens: 16_000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};
