export interface HealthResponse {
  status: "ok";
  /** The git commit the running image was built from (baked in by the Dockerfile). */
  commit: string;
}

/**
 * GET /api/health: liveness plus the deployed commit. The deploy workflow polls
 * it to confirm the new image is serving. It must stay cheap and never call Claude.
 */
export function handleHealthRequest(): Response {
  const body: HealthResponse = { status: "ok", commit: process.env.APP_COMMIT_SHA ?? "unknown" };
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
