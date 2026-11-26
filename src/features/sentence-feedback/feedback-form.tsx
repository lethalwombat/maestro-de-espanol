"use client";

import { type SubmitEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Message } from "@/components/ui/message";
import { Skeleton } from "@/components/ui/skeleton";
import { TextArea } from "@/components/ui/text-area";
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
    <section className="mt-8">
      <form className="grid gap-3" onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor="sentence" className="font-medium">
          Write a sentence in Spanish
        </label>
        <TextArea
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
        <Button
          type="submit"
          className="justify-self-start"
          loading={loading}
          disabled={sentence.trim() === ""}
        >
          {loading ? "Checking…" : "Check my sentence"}
        </Button>
      </form>

      <div className="mt-6">
        {loading && <Skeleton />}
        {state.status === "error" && (
          <Message tone="danger" className="animate-rise">
            {state.message}
          </Message>
        )}
        {state.status === "done" && <FeedbackResult feedback={state.feedback} />}
      </div>
    </section>
  );
}

function FeedbackResult({ feedback }: { feedback: Feedback }) {
  if (feedback.verdict === "not_spanish") {
    return (
      <Message tone="info" className="animate-rise">
        That doesn&apos;t look like Spanish. Try writing your sentence in Spanish.
      </Message>
    );
  }

  if (feedback.verdict === "correct") {
    return (
      <Message tone="success" className="animate-rise">
        ¡Perfecto! Your sentence is correct.
      </Message>
    );
  }

  return (
    <Card role="status" className="animate-rise">
      <p className="text-fg-muted">
        Corrected: <strong className="text-lg font-semibold text-fg">{feedback.corrected}</strong>
      </p>
      <ul aria-label="Corrections" className="mt-4 grid gap-3">
        {feedback.issues.map((issue, index) => (
          <li
            key={`${String(index)}-${issue.original}`}
            className="animate-rise"
            style={{ animationDelay: `calc(var(--delay-stagger) * ${String(index + 1)})` }}
          >
            <del className="text-danger decoration-2">{issue.original}</del> →{" "}
            <ins className="font-semibold text-success no-underline">{issue.correction}</ins>
            <span className="mt-1 block text-sm text-fg-muted">{issue.explanation}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
