// A stand-in for the Claude Messages API, used by Playwright (see playwright.config.ts).
// The app talks to it through the real SDK via ANTHROPIC_BASE_URL. Responses are
// canned per learner sentence (<sentence> tags) or exercise topic (<topic> tags);
// an unknown one is an error, so every e2e scenario has to declare its response
// here explicitly.
import { createServer, type IncomingMessage } from "node:http";

interface Canned {
  stop_reason?: "end_turn" | "refusal";
  /** The JSON the model "returns": a sentence-feedback or exercise output. */
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

const fillBlank = (sentence: string, answer: string, explanation: string) => ({
  type: "fill_blank",
  sentence,
  answer,
  alternatives: [],
  explanation,
});

const multipleChoice = (
  prompt: string,
  options: string[],
  correct: number,
  explanation: string,
) => ({
  type: "multiple_choice",
  prompt,
  options,
  correct_option: correct,
  explanation,
});

/** Exercise topics used by e2e/exercises*.spec.ts. Keep in step with e2e/exercise-helpers.ts. */
const EXERCISE_TOPICS: Record<string, Canned> = {
  "ser y estar": {
    feedback: {
      on_topic: true,
      exercise: {
        title: "Ser y estar",
        instructions: "Choose or write the right form of ser or estar.",
        items: [
          multipleChoice("Yo ___ de Chile.", ["soy", "estoy"], 0, "Origin takes ser."),
          fillBlank("Mi hermano ___ en casa.", "está", "Location takes estar."),
          multipleChoice("La sopa ___ fría.", ["es", "está"], 1, "A changeable state takes estar."),
          fillBlank("Ella ___ médica.", "es", "Professions take ser."),
          fillBlank("Nosotros ___ cansados.", "estamos", "A temporary state takes estar."),
        ],
      },
    },
  },
  "Python decorators": { feedback: { on_topic: false, exercise: null } },
  "tema rechazado": { stop_reason: "refusal" },
  // Breaks the schema (too few items): the app must treat it as invalid output.
  "salida rota": {
    feedback: {
      on_topic: true,
      exercise: {
        title: "Roto",
        instructions: "x",
        items: [fillBlank("Yo ___ aquí.", "estoy", "Location takes estar.")],
      },
    },
  },
};

/** Echoes the first line of the system prompt as the title, so e2e can see which prompt ran. */
const ECHO_TOPIC = "eco del prompt";

function echoExercise(system: string): Canned {
  const firstLine = system.split("\n", 1)[0] ?? "";
  const exercise = EXERCISE_TOPICS["ser y estar"]?.feedback as { exercise: object };
  return {
    feedback: {
      on_topic: true,
      exercise: { ...exercise.exercise, title: firstLine.slice(0, 120) },
    },
  };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function tagged(body: Record<string, unknown>, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*)</${tag}>`);
  return pattern.exec(JSON.stringify(body.messages ?? ""))?.[1];
}

function systemText(body: Record<string, unknown>): string {
  const system = body.system as Array<{ text?: string }> | string | undefined;
  return typeof system === "string"
    ? system
    : (system ?? []).map((block) => block.text ?? "").join("");
}

function cannedFor(body: Record<string, unknown>): { key: string | undefined; canned?: Canned } {
  const sentence = tagged(body, "sentence");
  if (sentence !== undefined) return { key: sentence, canned: CANNED[sentence] };
  const topic = tagged(body, "topic");
  if (topic === ECHO_TOPIC) return { key: topic, canned: echoExercise(systemText(body)) };
  return { key: topic, canned: topic === undefined ? undefined : EXERCISE_TOPICS[topic] };
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
    const { key: sentence, canned } = cannedFor(body);
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
