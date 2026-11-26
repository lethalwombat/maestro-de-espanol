import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LLM_CONFIG } from "./config";
import { requestStructured } from "./structured";
import { fakeAnthropic, jsonMessage } from "./testing";

const Schema = z.object({ answer: z.string() });
const request = { system: "You answer questions.", user: "Hola?", schema: Schema };

describe("requestStructured", () => {
  it("sends the configured model, effort, fallbacks and a JSON schema output format", async () => {
    const { client, requests } = fakeAnthropic(() => jsonMessage({ answer: "hola" }));

    await requestStructured(client, request);

    expect(requests).toHaveLength(1);
    const [sent] = requests;
    expect(sent?.url).toContain("/v1/messages");
    expect(sent?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(sent?.body).toMatchObject({
      model: LLM_CONFIG.model,
      max_tokens: LLM_CONFIG.maxTokens,
      fallbacks: "default",
      system: [
        { type: "text", text: "You answer questions.", cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: "Hola?" }],
      output_config: { effort: LLM_CONFIG.effort, format: { type: "json_schema" } },
    });
  });

  it("applies eval overrides for model and effort", async () => {
    const { client, requests } = fakeAnthropic(() => jsonMessage({ answer: "hola" }));

    await requestStructured(client, {
      ...request,
      overrides: { model: "claude-sonnet-5-5", effort: "low" },
    });

    expect(requests[0]?.body).toMatchObject({
      model: "claude-sonnet-5-5",
      output_config: { effort: "low" },
    });
  });

  it("returns parsed data when the output matches the schema", async () => {
    const { client } = fakeAnthropic(() => jsonMessage({ answer: "hola" }));

    const result = await requestStructured(client, request);

    expect(result).toMatchObject({ ok: true, data: { answer: "hola" } });
  });

  it("skips thinking blocks and parses the text block", async () => {
    const { client } = fakeAnthropic(() => ({
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: '{"answer":"sí"}' },
      ],
    }));

    const result = await requestStructured(client, request);

    expect(result).toMatchObject({ ok: true, data: { answer: "sí" } });
  });

  it("reports a refusal with its category before looking at the content", async () => {
    const { client } = fakeAnthropic(() => ({
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: null },
      content: [{ type: "text", text: '{"answ' }],
    }));

    const result = await requestStructured(client, request);

    expect(result).toMatchObject({ ok: false, reason: "refused", category: "cyber" });
  });

  it("reports truncation when the response hit max_tokens", async () => {
    const { client } = fakeAnthropic(() => ({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"answer":"hol' }],
    }));

    const result = await requestStructured(client, request);

    expect(result).toMatchObject({ ok: false, reason: "truncated", category: null });
  });

  it.each([
    ["no text block", { content: [] }],
    ["text that is not JSON", { content: [{ type: "text" as const, text: "hola" }] }],
    ["JSON that fails the schema", jsonMessage({ answer: 42 })],
  ])("reports invalid output for %s", async (_label, reply) => {
    const { client } = fakeAnthropic(() => reply);

    const result = await requestStructured(client, request);

    expect(result).toMatchObject({ ok: false, reason: "invalid_output" });
  });

  it("lets API errors propagate as typed SDK errors", async () => {
    const { client } = fakeAnthropic(() =>
      Response.json(
        { type: "error", error: { type: "rate_limit_error", message: "slow down" } },
        { status: 429 },
      ),
    );

    await expect(requestStructured(client, request)).rejects.toMatchObject({ status: 429 });
  });
});
