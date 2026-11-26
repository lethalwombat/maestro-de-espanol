import { handleFeedbackRequest } from "@/features/sentence-feedback/handler";
import { getAnthropicClient } from "@/lib/llm/client";

export async function POST(request: Request): Promise<Response> {
  return handleFeedbackRequest(request, getAnthropicClient());
}
