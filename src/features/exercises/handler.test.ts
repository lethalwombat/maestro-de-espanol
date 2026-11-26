import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryBackend } from "@/features/prompt-admin/memory-backend";
import { createPromptStore, type PromptStore } from "@/features/prompt-admin/store";
import { fakeAnthropic, jsonMessage, type FakeMessage } from "@/lib/llm/testing";
import { handleExerciseRequest } from "./handler";
import { DEFAULT_EXERCISE_PROMPT } from "./prompt";
import { ExerciseResponseSchema } from "./schema";

const item = (n: number) => ({
  type: "fill_blank",
  sentence: `Frase ${String(n)}: ella ___ médica.`,
  answer: "es",
  alternatives: [],
  explanation: "Professions take ser.",
});

const EXERCISE = {
  title: "Ser y estar",
  instructions: "Fill each blank.",
  items: [1, 2, 3, 4, 5].map(item),
};

function post(body: unknown): Request {
  return new Request("http://localhost/api/exercises", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function memoryStore(): PromptStore {
  return createPromptStore(createMemoryBackend(), { defaultText: DEFAULT_EXERCISE_PROMPT });
}

async function call(reply: FakeMessage | Response, body: unknown = { topic: "ser y estar" }) {
  const { client, requests } = fakeAnthropic(() => reply);
  const store = memoryStore();
  const response = await handleExerciseRequest(post(body), client, store);
  return { response, requests, json: (await response.json()) as unknown };
}

const CREDENTIAL_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_PROFILE",
  "ANTHROPIC_FEDERATION_RULE_ID",
  "ANTHROPIC_ORGANIZATION_ID",
  "ANTHROPIC_IDENTITY_TOKEN",
  "ANTHROPIC_IDENTITY_TOKEN_FILE",
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/exercises", () => {
  it("returns a valid exercise for a Spanish-language topic", async () => {
    const { response, json } = await call(jsonMessage({ on_topic: true, exercise: EXERCISE }));
    expect(response.status).toBe(200);
    expect(ExerciseResponseSchema.parse(json)).toEqual({ exercise: EXERCISE });
  });

  it("sends the active prompt as the system prompt and the topic inside <topic> tags", async () => {
    const { requests } = await call(jsonMessage({ on_topic: true, exercise: EXERCISE }), {
      topic: "  por y para ",
    });
    const body = requests[0]?.body as {
      system: Array<{ text: string }>;
      messages: Array<{ content: string }>;
      output_config: { format: { type: string } };
    };
    expect(body.system[0]?.text).toBe(DEFAULT_EXERCISE_PROMPT);
    expect(body.messages[0]?.content).toBe("<topic>por y para</topic>");
    expect(body.output_config.format.type).toBe("json_schema");
  });

  it("uses a newly saved prompt on the next request, with no restart", async () => {
    const { client, requests } = fakeAnthropic(() =>
      jsonMessage({ on_topic: true, exercise: EXERCISE }),
    );
    const store = memoryStore();
    await store.save("A saved exercise prompt.");
    await handleExerciseRequest(post({ topic: "food" }), client, store);
    expect((requests[0]?.body as { system: Array<{ text: string }> }).system[0]?.text).toBe(
      "A saved exercise prompt.",
    );
  });

  it("falls back to the default prompt when the store can't be read, and logs without the prompt", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client, requests } = fakeAnthropic(() =>
      jsonMessage({ on_topic: true, exercise: EXERCISE }),
    );
    const broken: PromptStore = {
      ...memoryStore(),
      getActive: () => Promise.reject(new Error("table unreachable")),
    };
    const response = await handleExerciseRequest(post({ topic: "food" }), client, broken);

    expect(response.status).toBe(200);
    expect((requests[0]?.body as { system: Array<{ text: string }> }).system[0]?.text).toBe(
      DEFAULT_EXERCISE_PROMPT,
    );
    const logged = error.mock.calls.flat().map(String).join("\n");
    expect(logged).toMatch(/prompt store/i);
    expect(logged).not.toContain(DEFAULT_EXERCISE_PROMPT.slice(0, 40));
  });

  it("says when a topic isn't about the Spanish language", async () => {
    const { response, json } = await call(jsonMessage({ on_topic: false, exercise: null }), {
      topic: "Python decorators",
    });
    expect(response.status).toBe(200);
    expect(json).toEqual({ off_topic: true });
  });

  it.each([
    ["empty", { topic: "" }],
    ["whitespace only", { topic: "   " }],
    ["over 200 characters", { topic: "a".repeat(201) }],
    ["missing", {}],
  ])("rejects a topic that is %s without calling Claude", async (_name, body) => {
    const { response, requests, json } = await call(jsonMessage({}), body);
    expect(response.status).toBe(400);
    expect(json).toMatchObject({ error: "invalid_request" });
    expect(requests).toHaveLength(0);
  });

  it("rejects a body that isn't JSON", async () => {
    const { response, json } = await call(jsonMessage({}), "not json");
    expect(response.status).toBe(400);
    expect(json).toMatchObject({ error: "invalid_request" });
  });

  it("treats a schema-breaking response as invalid output, never a partial exercise", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { response, json } = await call(
      jsonMessage({ on_topic: true, exercise: { ...EXERCISE, items: EXERCISE.items.slice(0, 3) } }),
    );
    expect(response.status).toBe(502);
    expect(json).toMatchObject({ error: "unavailable" });
    expect(json).not.toHaveProperty("exercise");
  });

  it("reports a refusal", async () => {
    const { response, json } = await call({ stop_reason: "refusal", content: [] });
    expect(response.status).toBe(422);
    expect(json).toMatchObject({ error: "refused" });
  });

  it("reports a truncated response as unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { response, json } = await call({ stop_reason: "max_tokens", content: [] });
    expect(response.status).toBe(502);
    expect(json).toMatchObject({ error: "unavailable" });
  });

  it("reports a rate limit as busy", async () => {
    const { response, json } = await call(
      Response.json(
        { type: "error", error: { type: "rate_limit_error", message: "slow down" } },
        { status: 429 },
      ),
    );
    expect(response.status).toBe(503);
    expect(json).toMatchObject({ error: "busy" });
  });

  it("reports an API outage as unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { response, json } = await call(
      Response.json(
        { type: "error", error: { type: "overloaded_error", message: "overloaded" } },
        { status: 529 },
      ),
    );
    expect(response.status).toBe(502);
    expect(json).toMatchObject({ error: "unavailable" });
  });

  it("reports a missing credential as unavailable", async () => {
    // An empty config dir and no credential variables, as on Azure today.
    const configDir = mkdtempSync(join(tmpdir(), "no-anthropic-config-"));
    vi.stubEnv("ANTHROPIC_CONFIG_DIR", configDir);
    for (const name of CREDENTIAL_VARS) vi.stubEnv(name, undefined);
    try {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const fetchSpy = vi.fn<typeof fetch>();
      const client = new Anthropic({ fetch: fetchSpy, maxRetries: 0 });
      const response = await handleExerciseRequest(post({ topic: "food" }), client, memoryStore());
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ error: "unavailable" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      rmSync(configDir, { recursive: true, force: true });
    }
  });
});
