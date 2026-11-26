import { handleExerciseRequest } from "@/features/exercises/handler";
import { getExercisePromptStore } from "@/features/prompt-admin/get-store";
import { getAnthropicClient } from "@/lib/llm/client";

export async function POST(request: Request): Promise<Response> {
  return handleExerciseRequest(request, getAnthropicClient(), getExercisePromptStore());
}
