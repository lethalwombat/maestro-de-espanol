import Anthropic from "@anthropic-ai/sdk";
import type { PromptStore } from "@/features/prompt-admin/store";
import { generateExercise } from "./generate";
import { DEFAULT_EXERCISE_PROMPT } from "./prompt";
import { type ExerciseErrorCode, ExerciseRequestSchema, type ExerciseResponse } from "./schema";

const MESSAGES: Record<Exclude<ExerciseErrorCode, "invalid_request">, string> = {
  refused: "I can't make an exercise on that topic. Try a different one.",
  unavailable: "The tutor couldn't create that exercise just now. Please try again.",
  busy: "The tutor is busy right now. Please try again in a moment.",
};

function respond(status: number, body: ExerciseResponse): Response {
  return Response.json(body, { status });
}

function failure(status: number, error: Exclude<ExerciseErrorCode, "invalid_request">): Response {
  return respond(status, { error, message: MESSAGES[error] });
}

/** The active prompt, or the code default if the store can't be read. Never logs prompt text. */
async function activePrompt(store: PromptStore): Promise<string> {
  try {
    const active = await store.getActive();
    return active.source === "saved" ? active.version.text : active.text;
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown error";
    console.error(`exercises: prompt store unreadable (${reason}); using the default prompt`);
    return DEFAULT_EXERCISE_PROMPT;
  }
}

/** POST /api/exercises, with the Claude client and prompt store injected so it can be tested. */
export async function handleExerciseRequest(
  request: Request,
  client: Anthropic,
  store: PromptStore,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { error: "invalid_request", message: "Expected a JSON body." });
  }

  const input = ExerciseRequestSchema.safeParse(body);
  if (!input.success) {
    const message = input.error.issues[0]?.message ?? "Invalid request.";
    return respond(400, { error: "invalid_request", message });
  }

  try {
    const system = await activePrompt(store);
    const result = await generateExercise(client, input.data.topic, system);
    if (result.ok) {
      const { exercise } = result.data;
      return respond(200, exercise === null ? { off_topic: true } : { exercise });
    }
    if (result.reason === "refused") return failure(422, "refused");
    console.error(`exercises: ${result.reason}: ${result.detail}`);
    return failure(502, "unavailable");
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return failure(503, "busy");
    if (error instanceof Anthropic.APIError) {
      console.error(`exercises: Claude API error ${String(error.status)}: ${error.message}`);
      return failure(502, "unavailable");
    }
    // Anything else (e.g. the SDK's plain Error when no credential is configured)
    // gets the same friendly message instead of a 500.
    console.error(`exercises: unexpected error: ${String(error)}`);
    return failure(502, "unavailable");
  }
}
