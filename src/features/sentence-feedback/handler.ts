import Anthropic from "@anthropic-ai/sdk";
import { getSentenceFeedback } from "./get-feedback";
import { type FeedbackErrorCode, FeedbackRequestSchema, type FeedbackResponse } from "./schema";

const MESSAGES: Record<Exclude<FeedbackErrorCode, "invalid_request">, string> = {
  refused: "I can't give feedback on that sentence. Try a different one.",
  unavailable: "The tutor couldn't check that sentence just now. Please try again.",
  busy: "The tutor is busy right now. Please try again in a moment.",
};

function respond(status: number, body: FeedbackResponse): Response {
  return Response.json(body, { status });
}

function failure(status: number, error: Exclude<FeedbackErrorCode, "invalid_request">): Response {
  return respond(status, { error, message: MESSAGES[error] });
}

/** POST /api/feedback, with the Claude client injected so it can be tested. */
export async function handleFeedbackRequest(
  request: Request,
  client: Anthropic,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { error: "invalid_request", message: "Expected a JSON body." });
  }

  const input = FeedbackRequestSchema.safeParse(body);
  if (!input.success) {
    const message = input.error.issues[0]?.message ?? "Invalid request.";
    return respond(400, { error: "invalid_request", message });
  }

  try {
    const result = await getSentenceFeedback(client, input.data.sentence);
    if (result.ok) return respond(200, { feedback: result.data });
    if (result.reason === "refused") return failure(422, "refused");
    console.error(`sentence-feedback: ${result.reason}: ${result.detail}`);
    return failure(502, "unavailable");
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return failure(503, "busy");
    if (error instanceof Anthropic.APIError) {
      console.error(
        `sentence-feedback: Claude API error ${String(error.status)}: ${error.message}`,
      );
      return failure(502, "unavailable");
    }
    throw error;
  }
}
