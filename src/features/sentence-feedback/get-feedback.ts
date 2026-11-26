import type Anthropic from "@anthropic-ai/sdk";
import {
  requestStructured,
  type StructuredRequest,
  type StructuredResult,
} from "@/lib/llm/structured";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt";
import { type Feedback, FeedbackSchema } from "./schema";

/** The app's entry point for sentence feedback. Evals call this same function. */
export function getSentenceFeedback(
  client: Anthropic,
  sentence: string,
  overrides?: StructuredRequest<typeof FeedbackSchema>["overrides"],
): Promise<StructuredResult<Feedback>> {
  return requestStructured(client, {
    system: SYSTEM_PROMPT,
    user: buildUserMessage(sentence),
    schema: FeedbackSchema,
    overrides,
  });
}
