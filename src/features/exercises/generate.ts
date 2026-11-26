import type Anthropic from "@anthropic-ai/sdk";
import {
  requestStructured,
  type StructuredRequest,
  type StructuredResult,
} from "@/lib/llm/structured";
import { buildUserMessage } from "./prompt";
import { type ExerciseOutput, ExerciseOutputSchema } from "./schema";

/**
 * The app's entry point for exercise generation. `system` is the active prompt
 * (from the admin panel, or the default); evals pass the code default. The topic
 * always arrives in the user message, inside <topic> tags.
 */
export function generateExercise(
  client: Anthropic,
  topic: string,
  system: string,
  overrides?: StructuredRequest<typeof ExerciseOutputSchema>["overrides"],
): Promise<StructuredResult<ExerciseOutput>> {
  return requestStructured(client, {
    system,
    user: buildUserMessage(topic),
    schema: ExerciseOutputSchema,
    overrides,
  });
}
