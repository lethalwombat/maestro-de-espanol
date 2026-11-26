import { connection } from "next/server";
import { handleHealthRequest } from "@/features/health/handler";

export async function GET(): Promise<Response> {
  // Render per request, never prerendered at build time: a health check must reach the server.
  await connection();
  return handleHealthRequest();
}
