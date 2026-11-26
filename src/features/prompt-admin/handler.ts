import type { z } from "zod";
import {
  type AdminResponse,
  type AdminState,
  PromptTextSchema,
  RestoreRequestSchema,
  SaveRequestSchema,
} from "./schema";
import { type PromptStore, VersionNotFoundError } from "./store";

export type AdminAction = "get" | "save" | "restore" | "restore-default";

const UNAVAILABLE = "The prompt store couldn't be reached. Your text hasn't been saved; try again.";

function respond(status: number, body: AdminResponse): Response {
  return Response.json(body, { status });
}

function invalid(message: string): Response {
  return respond(400, { error: "invalid_request", message });
}

function firstLine(text: string): string {
  return text.split("\n", 1)[0]?.trim() ?? "";
}

async function state(store: PromptStore): Promise<AdminState> {
  const [active, versions] = await Promise.all([store.getActive(), store.listVersions()]);
  return {
    active: active.source === "default" ? active : { source: "saved", ...active.version },
    versions: versions.map(({ id, savedAt, text }) => ({
      id,
      savedAt,
      firstLine: firstLine(text),
    })),
  };
}

async function readBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S> | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid("Expected a JSON body.");
  }
  const parsed = schema.safeParse(body);
  return parsed.success
    ? parsed.data
    : invalid(parsed.error.issues[0]?.message ?? "Invalid request.");
}

/** /api/admin/prompts and its actions, with the store injected so it can be tested. */
export async function handleAdminPromptRequest(
  request: Request,
  store: PromptStore,
  action: AdminAction,
): Promise<Response> {
  try {
    switch (action) {
      case "get":
        break;
      case "save": {
        const body = await readBody(request, SaveRequestSchema);
        if (body instanceof Response) return body;
        const text = PromptTextSchema.safeParse(body.text);
        if (!text.success) return invalid(text.error.issues[0]?.message ?? "Invalid prompt.");
        await store.save(text.data);
        break;
      }
      case "restore": {
        const body = await readBody(request, RestoreRequestSchema);
        if (body instanceof Response) return body;
        await store.restore(body.id);
        break;
      }
      case "restore-default":
        await store.restoreDefault();
        break;
    }
    return respond(200, await state(store));
  } catch (error) {
    if (error instanceof VersionNotFoundError) {
      return respond(404, { error: "not_found", message: "That version no longer exists." });
    }
    // The error's name only: never the prompt text.
    const reason = error instanceof Error ? error.name : "unknown error";
    console.error(`prompt-admin: ${action} failed (${reason})`);
    return respond(503, { error: "unavailable", message: UNAVAILABLE });
  }
}
