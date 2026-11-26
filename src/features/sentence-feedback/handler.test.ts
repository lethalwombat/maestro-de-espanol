import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeAnthropic, jsonMessage, type Responder } from "@/lib/llm/testing";
import { handleFeedbackRequest } from "./handler";
import { MAX_SENTENCE_LENGTH, type Feedback } from "./schema";

const FEEDBACK: Feedback = {
  verdict: "has_errors",
  corrected: "Yo soy estudiante.",
  issues: [
    {
      original: "es",
      correction: "soy",
      explanation: "Conjugation: with 'yo', ser takes the form 'soy'.",
    },
  ],
};

function post(body: unknown): Request {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(body: unknown, responder: Responder = () => jsonMessage(FEEDBACK)) {
  const fake = fakeAnthropic(responder);
  const response = await handleFeedbackRequest(post(body), fake.client);
  return { response, json: (await response.json()) as unknown, requests: fake.requests };
}

describe("POST /api/feedback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns Claude's feedback for a sentence", async () => {
    const { response, json, requests } = await call({ sentence: "Yo es estudiante." });

    expect(response.status).toBe(200);
    expect(json).toEqual({ feedback: FEEDBACK });
    expect(JSON.stringify(requests[0]?.body.messages)).toContain(
      "<sentence>Yo es estudiante.</sentence>",
    );
  });

  it("trims the sentence before sending it", async () => {
    const { requests } = await call({ sentence: "   Hola.  " });

    expect(JSON.stringify(requests[0]?.body.messages)).toContain("<sentence>Hola.</sentence>");
  });

  it.each([
    ["an empty sentence", { sentence: "   " }, "Write a sentence first."],
    [
      "a sentence over the limit",
      { sentence: "a".repeat(MAX_SENTENCE_LENGTH + 1) },
      `Keep it under ${MAX_SENTENCE_LENGTH} characters.`,
    ],
    ["a missing field", {}, expect.any(String) as string],
    ["a body that is not JSON", "not json", "Expected a JSON body."],
  ])("rejects %s without calling Claude", async (_label, body, message) => {
    const { response, json, requests } = await call(body);

    expect(response.status).toBe(400);
    expect(json).toMatchObject({ error: "invalid_request", message });
    expect(requests).toHaveLength(0);
  });

  it("explains a refusal with 422", async () => {
    const { response, json } = await call({ sentence: "Hola." }, () => ({
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: null, explanation: null },
    }));

    expect(response.status).toBe(422);
    expect(json).toMatchObject({ error: "refused" });
  });

  it.each([
    ["truncated output", () => ({ stop_reason: "max_tokens" })],
    ["output that fails the schema", () => jsonMessage({ verdict: "maybe" })],
    [
      "a server error from the API",
      () =>
        Response.json(
          { type: "error", error: { type: "api_error", message: "boom" } },
          { status: 500 },
        ),
    ],
  ] satisfies Array<[string, Responder]>)("returns 502 for %s", async (_label, responder) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { response, json } = await call({ sentence: "Hola." }, responder);

    expect(response.status).toBe(502);
    expect(json).toMatchObject({ error: "unavailable" });
  });

  it("returns 503 when rate limited", async () => {
    const { response, json } = await call({ sentence: "Hola." }, () =>
      Response.json(
        { type: "error", error: { type: "rate_limit_error", message: "slow down" } },
        { status: 429 },
      ),
    );

    expect(response.status).toBe(503);
    expect(json).toMatchObject({ error: "busy" });
  });
});
