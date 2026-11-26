"use client";

import { type SubmitEvent, useState } from "react";
import { type Feedback, FeedbackResponseSchema, MAX_SENTENCE_LENGTH } from "./schema";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; feedback: Feedback }
  | { status: "error"; message: string };

const NETWORK_ERROR = "Couldn't reach the tutor. Check your connection and try again.";

async function requestFeedback(sentence: string): Promise<State> {
  let response: Response;
  try {
    response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sentence }),
    });
  } catch {
    return { status: "error", message: NETWORK_ERROR };
  }

  const parsed = FeedbackResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { status: "error", message: NETWORK_ERROR };
  if ("feedback" in parsed.data) return { status: "done", feedback: parsed.data.feedback };
  return { status: "error", message: parsed.data.message };
}

export function FeedbackForm() {
  const [sentence, setSentence] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const loading = state.status === "loading";

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "loading" });
    setState(await requestFeedback(sentence));
  }

  return (
    <section className="feedback">
      <form onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor="sentence">Write a sentence in Spanish</label>
        <textarea
          id="sentence"
          name="sentence"
          rows={3}
          maxLength={MAX_SENTENCE_LENGTH}
          placeholder="Ayer yo fui a la playa con mis amigos."
          value={sentence}
          onChange={(event) => {
            setSentence(event.target.value);
          }}
        />
        <button type="submit" disabled={loading || sentence.trim() === ""}>
          {loading ? "Checking…" : "Check my sentence"}
        </button>
      </form>

      {state.status === "error" && (
        <p role="alert" className="error">
          {state.message}
        </p>
      )}
      {state.status === "done" && <FeedbackResult feedback={state.feedback} />}
    </section>
  );
}

function FeedbackResult({ feedback }: { feedback: Feedback }) {
  if (feedback.verdict === "not_spanish") {
    return (
      <p role="status" className="result">
        That doesn&apos;t look like Spanish. Try writing your sentence in Spanish.
      </p>
    );
  }

  if (feedback.verdict === "correct") {
    return (
      <p role="status" className="result correct">
        ¡Perfecto! Your sentence is correct.
      </p>
    );
  }

  return (
    <div role="status" className="result">
      <p>
        Corrected: <strong>{feedback.corrected}</strong>
      </p>
      <ul aria-label="Corrections">
        {feedback.issues.map((issue, index) => (
          <li key={`${String(index)}-${issue.original}`}>
            <del>{issue.original}</del> → <ins>{issue.correction}</ins>
            <span className="explanation">{issue.explanation}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
