import { connection } from "next/server";
import { getExercisePromptStore } from "@/features/prompt-admin/get-store";
import { handleAdminPromptRequest } from "@/features/prompt-admin/handler";

export async function GET(request: Request): Promise<Response> {
  // Always at request time: the store changes without a rebuild.
  await connection();
  return handleAdminPromptRequest(request, getExercisePromptStore(), "get");
}

export async function POST(request: Request): Promise<Response> {
  return handleAdminPromptRequest(request, getExercisePromptStore(), "save");
}
