// Test-only helpers: a real Anthropic client wired to an in-memory transport, so
// unit tests exercise the SDK's request building and response handling without
// touching the network.
import Anthropic from "@anthropic-ai/sdk";

export interface RecordedRequest {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

/** The subset of a Messages API response that tests usually care about. */
export interface FakeMessage {
  content?: Array<
    { type: "text"; text: string } | { type: "thinking"; thinking: string; signature: string }
  >;
  stop_reason?: string;
  stop_details?: { type: "refusal"; category: string | null; explanation: string | null } | null;
  model?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export type Responder = (request: RecordedRequest) => FakeMessage | Response;

export function messageBody(
  message: FakeMessage,
  requestedModel: unknown,
): Record<string, unknown> {
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: message.model ?? (typeof requestedModel === "string" ? requestedModel : "unknown"),
    content: message.content ?? [],
    stop_reason: message.stop_reason ?? "end_turn",
    stop_sequence: null,
    stop_details: message.stop_details ?? null,
    usage: message.usage ?? { input_tokens: 100, output_tokens: 50 },
  };
}

/** A text response whose text is `value` serialised as JSON. */
export function jsonMessage(value: unknown, extra: Omit<FakeMessage, "content"> = {}): FakeMessage {
  return { ...extra, content: [{ type: "text", text: JSON.stringify(value) }] };
}

export function fakeAnthropic(respond: Responder): {
  client: Anthropic;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];

  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    const rawBody = typeof init?.body === "string" ? init.body : "{}";
    const recorded: RecordedRequest = {
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(rawBody) as Record<string, unknown>,
    };
    requests.push(recorded);
    const reply = respond(recorded);
    if (reply instanceof Response) return Promise.resolve(reply);
    return Promise.resolve(Response.json(messageBody(reply, recorded.body.model)));
  };

  const client = new Anthropic({
    apiKey: "test-key",
    baseURL: "http://fake-anthropic.test",
    fetch: fetchImpl,
    maxRetries: 0,
  });
  return { client, requests };
}
