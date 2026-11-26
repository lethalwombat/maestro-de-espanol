import { getExercisePromptStore } from "@/features/prompt-admin/get-store";
import { handleAdminPromptRequest } from "@/features/prompt-admin/handler";

export async function POST(request: Request): Promise<Response> {
  return handleAdminPromptRequest(request, getExercisePromptStore(), "restore-default");
}
