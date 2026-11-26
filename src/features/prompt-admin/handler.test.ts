import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryBackend } from "./memory-backend";
import { handleAdminPromptRequest } from "./handler";
import { AdminResponseSchema } from "./schema";
import { createPromptStore, type PromptStore } from "./store";

const DEFAULT = "Default prompt.\nSecond line.";

function makeStore(): PromptStore {
  let tick = 0;
  return createPromptStore(createMemoryBackend(), {
    defaultText: DEFAULT,
    now: () => new Date(Date.UTC(2026, 10, 26, 9, 0, tick++)),
  });
}

function request(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/admin/prompts", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function run(
  store: PromptStore,
  action: Parameters<typeof handleAdminPromptRequest>[2],
  body?: unknown,
) {
  const method = action === "get" ? "GET" : "POST";
  const response = await handleAdminPromptRequest(request(method, body), store, action);
  return { status: response.status, json: AdminResponseSchema.parse(await response.json()) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin prompt API", () => {
  it("shows the code default as active when nothing is saved", async () => {
    const { status, json } = await run(makeStore(), "get");
    expect(status).toBe(200);
    expect(json).toEqual({ active: { source: "default", text: DEFAULT }, versions: [] });
  });

  it("saves a new version, makes it active and lists versions newest first with their first line", async () => {
    const store = makeStore();
    await run(store, "save", { text: "First prompt\nmore" });
    const { status, json } = await run(store, "save", { text: "Second prompt\nmore" });

    expect(status).toBe(200);
    expect(json).toMatchObject({
      active: { source: "saved", text: "Second prompt\nmore", savedAt: "2026-11-26T09:00:01.000Z" },
      versions: [
        { firstLine: "Second prompt", savedAt: "2026-11-26T09:00:01.000Z" },
        { firstLine: "First prompt", savedAt: "2026-11-26T09:00:00.000Z" },
      ],
    });
  });

  it.each([
    ["empty", ""],
    ["over 20,000 characters", "a".repeat(20_001)],
  ])("refuses to save a prompt that is %s", async (_name, text) => {
    const store = makeStore();
    const { status, json } = await run(store, "save", { text });
    expect(status).toBe(400);
    expect(json).toMatchObject({ error: "invalid_request" });
    expect(await store.listVersions()).toEqual([]);
  });

  it("restores an earlier version as a new copy", async () => {
    const store = makeStore();
    await run(store, "save", { text: "one" });
    await run(store, "save", { text: "two" });
    const [, first] = await store.listVersions();

    const { status, json } = await run(store, "restore", { id: first?.id });
    expect(status).toBe(200);
    expect(json).toMatchObject({ active: { source: "saved", text: "one" } });
    expect("versions" in json && json.versions.map((v) => v.firstLine)).toEqual([
      "one",
      "two",
      "one",
    ]);
  });

  it("answers 404 when restoring a version that doesn't exist", async () => {
    const { status, json } = await run(makeStore(), "restore", { id: "missing" });
    expect(status).toBe(404);
    expect(json).toMatchObject({ error: "not_found" });
  });

  it("restores the code default", async () => {
    const store = makeStore();
    await run(store, "save", { text: "one" });
    const { json } = await run(store, "restore-default");
    expect(json).toMatchObject({ active: { source: "default", text: DEFAULT } });
  });

  it("rejects a body that isn't JSON", async () => {
    const { status, json } = await run(makeStore(), "save", "nope");
    expect(status).toBe(400);
    expect(json).toMatchObject({ error: "invalid_request" });
  });

  it("answers 503 when the store fails, and logs without the prompt text", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store: PromptStore = {
      ...makeStore(),
      save: () => Promise.reject(new Error("table unreachable")),
    };
    const { status, json } = await run(store, "save", { text: "Secret prompt text" });
    expect(status).toBe(503);
    expect(json).toMatchObject({ error: "unavailable" });
    expect(errors.mock.calls.flat().map(String).join("\n")).not.toContain("Secret prompt text");
  });
});
