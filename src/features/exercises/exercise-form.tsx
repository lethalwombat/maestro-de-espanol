"use client";

import { type SubmitEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Message } from "@/components/ui/message";
import { Skeleton } from "@/components/ui/skeleton";
import { TextInput } from "@/components/ui/text-input";
import { ExerciseView } from "./exercise-view";
import { type Exercise, ExerciseRequestSchema, ExerciseResponseSchema } from "./schema";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; exercise: Exercise; run: number }
  | { status: "off_topic" }
  | { status: "error"; message: string };

const NETWORK_ERROR = "Couldn't reach the tutor. Check your connection and try again.";

async function requestExercise(topic: string, run: number): Promise<State> {
  let response: Response;
  try {
    response = await fetch("/api/exercises", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic }),
    });
  } catch {
    return { status: "error", message: NETWORK_ERROR };
  }

  // Validated here too: a response that breaks the schema never half-renders.
  const parsed = ExerciseResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { status: "error", message: NETWORK_ERROR };
  if ("exercise" in parsed.data) return { status: "done", exercise: parsed.data.exercise, run };
  if ("off_topic" in parsed.data) return { status: "off_topic" };
  return { status: "error", message: parsed.data.message };
}

export function ExerciseForm() {
  const [topic, setTopic] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "idle" });
  const runs = useRef(0);
  const topicField = useRef<HTMLInputElement>(null);
  const loading = state.status === "loading";

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = ExerciseRequestSchema.safeParse({ topic });
    if (!input.success) {
      setInvalid(input.error.issues[0]?.message ?? "Check the topic.");
      topicField.current?.focus();
      return;
    }
    setInvalid(null);
    setState({ status: "loading" });
    runs.current += 1;
    setState(await requestExercise(input.data.topic, runs.current));
  }

  function newExercise() {
    setState({ status: "idle" });
    topicField.current?.focus();
    topicField.current?.select();
  }

  return (
    <section className="mt-8">
      <form className="grid gap-3" noValidate onSubmit={(event) => void onSubmit(event)}>
        <label htmlFor="topic" className="font-medium">
          Topic
        </label>
        <TextInput
          ref={topicField}
          id="topic"
          name="topic"
          placeholder="Preterite vs imperfect"
          value={topic}
          aria-invalid={invalid === null ? undefined : true}
          aria-describedby={invalid === null ? undefined : "topic-error"}
          onChange={(event) => {
            setTopic(event.target.value);
          }}
        />
        {invalid !== null && (
          <p id="topic-error" className="text-sm text-danger">
            {invalid}
          </p>
        )}
        <Button type="submit" className="justify-self-start" loading={loading}>
          {loading ? "Creating…" : "Create exercise"}
        </Button>
      </form>

      <div className="mt-6">
        {loading && <Skeleton />}
        {state.status === "error" && (
          <Message tone="danger" className="animate-rise">
            {state.message}
          </Message>
        )}
        {state.status === "off_topic" && (
          <Message tone="info" className="animate-rise">
            That topic isn&apos;t about the Spanish language. Try a Spanish grammar point or a
            vocabulary theme, such as &ldquo;ser vs estar&rdquo; or &ldquo;food&rdquo;.
          </Message>
        )}
        {state.status === "done" && (
          <ExerciseView key={state.run} exercise={state.exercise} onNewExercise={newExercise} />
        )}
      </div>
    </section>
  );
}
