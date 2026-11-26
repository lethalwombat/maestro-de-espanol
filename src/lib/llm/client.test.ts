import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { getAnthropicClient } from "./client";

describe("getAnthropicClient", () => {
  it("creates one shared client with retries and a timeout", () => {
    const client = getAnthropicClient();

    expect(client).toBeInstanceOf(Anthropic);
    expect(getAnthropicClient()).toBe(client);
    expect(client.maxRetries).toBe(2);
    expect(client.timeout).toBe(60_000);
  });
});
