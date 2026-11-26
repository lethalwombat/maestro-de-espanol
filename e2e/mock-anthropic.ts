// A stand-in for the Claude Messages API, used by Playwright (see playwright.config.ts).
// The app talks to it through the real SDK via ANTHROPIC_BASE_URL. Responses are
// canned per learner sentence; an unknown sentence is an error, so every e2e
// scenario has to declare its response here explicitly.
import { createServer, type IncomingMessage } from "node:http";

interface Canned {
  stop_reason?: "end_turn" | "refusal";
  feedback?: unknown;
}

const CANNED: Record<string, Canned> = {
  "Yo es estudiante.": {
    feedback: {
      verdict: "has_errors",
      corrected: "Yo soy estudiante.",
      issues: [
        {
          original: "es",
          correction: "soy",
          explanation: "Conjugation: with 'yo', the verb ser is 'soy'.",
        },
      ],
    },
  },
  "Me gusta el café.": {
    feedback: { verdict: "correct", corrected: "Me gusta el café.", issues: [] },
  },
  "Hello there, how are you?": {
    feedback: { verdict: "not_spanish", corrected: "", issues: [] },
  },
  "Esta frase provoca un rechazo.": { stop_reason: "refusal" },
};

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sentenceFrom(body: Record<string, unknown>): string | undefined {
  const match = /<sentence>([\s\S]*)<\/sentence>/.exec(JSON.stringify(body.messages ?? ""));
  return match?.[1];
}

const server = createServer((request, response) => {
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };

  if (request.method === "GET" && request.url === "/health") {
    send(200, { ok: true });
    return;
  }
  if (request.method !== "POST" || !request.url?.startsWith("/v1/messages")) {
    send(404, {
      type: "error",
      error: { type: "not_found_error", message: "mock: unknown route" },
    });
    return;
  }

  void readJson(request).then((body) => {
    const sentence = sentenceFrom(body);
    const canned = sentence === undefined ? undefined : CANNED[sentence];
    if (!canned) {
      send(400, {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: `mock: no canned response for ${JSON.stringify(sentence)}`,
        },
      });
      return;
    }
    const refused = canned.stop_reason === "refusal";
    send(200, {
      id: "msg_mock",
      type: "message",
      role: "assistant",
      model: body.model,
      content: refused ? [] : [{ type: "text", text: JSON.stringify(canned.feedback) }],
      stop_reason: canned.stop_reason ?? "end_turn",
      stop_sequence: null,
      stop_details: refused ? { type: "refusal", category: null, explanation: null } : null,
      usage: { input_tokens: 120, output_tokens: 60 },
    });
  });
});

const port = Number(process.env.MOCK_ANTHROPIC_PORT ?? "4010");
server.listen(port, "127.0.0.1", () => {
  console.log(`mock-anthropic listening on http://127.0.0.1:${String(port)}`);
});
