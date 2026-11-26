"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { type SubmitEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Message } from "@/components/ui/message";
import { TextInput } from "@/components/ui/text-input";
import { type Answer, type GradedExercise, gradeExercise, type ItemResult } from "./grade";
import type { Exercise, ExerciseItem } from "./schema";

interface ExerciseViewProps {
  exercise: Exercise;
  onNewExercise: () => void;
}

/** One generated exercise: answer the items, check them in code, try again. */
export function ExerciseView({ exercise, onNewExercise }: ExerciseViewProps) {
  const [answers, setAnswers] = useState<Answer[]>(() => exercise.items.map(() => undefined));
  const [graded, setGraded] = useState<GradedExercise | null>(null);
  const checked = graded !== null;

  function answer(index: number, value: Answer) {
    setAnswers((current) => current.map((old, position) => (position === index ? value : old)));
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setGraded(gradeExercise(exercise, answers));
  }

  function tryAgain() {
    setAnswers(exercise.items.map(() => undefined));
    setGraded(null);
  }

  return (
    <Card className="animate-rise">
      <h2 className="text-lg font-semibold">{exercise.title}</h2>
      <p className="mt-1 text-fg-muted">{exercise.instructions}</p>

      <form className="mt-4" onSubmit={onSubmit}>
        <ol aria-label="Items" className="grid gap-6">
          {exercise.items.map((item, index) => (
            <li key={`${String(index)}-${item.type}`}>
              <ItemInput
                item={item}
                index={index}
                value={answers[index]}
                locked={checked}
                onAnswer={(value) => {
                  answer(index, value);
                }}
              />
              {graded?.results[index] && (
                <ItemFeedback result={graded.results[index]} explanation={item.explanation} />
              )}
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {checked ? (
            <>
              <Button type="button" onClick={onNewExercise}>
                New exercise
              </Button>
              <Button type="button" variant="secondary" onClick={tryAgain}>
                Try again
              </Button>
            </>
          ) : (
            <Button type="submit">Check answers</Button>
          )}
        </div>
      </form>

      {graded && (
        <Message
          tone={graded.score === graded.total ? "success" : "info"}
          className="mt-4 animate-rise"
        >
          {graded.score} of {graded.total} right.
        </Message>
      )}
    </Card>
  );
}

interface ItemInputProps {
  item: ExerciseItem;
  index: number;
  value: Answer;
  locked: boolean;
  onAnswer: (value: Answer) => void;
}

function ItemInput({ item, index, value, locked, onAnswer }: ItemInputProps) {
  const id = useId();
  const number = `${String(index + 1)}. `;

  if (item.type === "multiple_choice") {
    return (
      <ChoiceGroup
        legend={`${number}${item.prompt}`}
        name={id}
        options={item.options}
        value={typeof value === "number" ? value : undefined}
        onChange={onAnswer}
        disabled={locked}
      />
    );
  }

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="font-medium">
        {number}
        {item.sentence}
      </label>
      <TextInput
        id={id}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        lang="es"
        value={typeof value === "string" ? value : ""}
        readOnly={locked}
        onChange={(event) => {
          onAnswer(event.target.value);
        }}
      />
    </div>
  );
}

function ItemFeedback({ result, explanation }: { result: ItemResult; explanation: string }) {
  const Icon = result.correct ? CircleCheck : CircleX;
  return (
    <div className="mt-3 grid gap-1 animate-rise">
      <p
        className={`flex items-center gap-2 font-semibold ${result.correct ? "text-success" : "text-danger"}`}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        {result.correct ? "Right" : "Wrong"}
      </p>
      <p>
        Your answer: <span lang="es">{result.given ?? "no answer"}</span>
      </p>
      {!result.correct && (
        <p>
          Correct answer: <strong lang="es">{result.expected}</strong>
        </p>
      )}
      {result.accentNote !== null && (
        <p>
          Watch the accent: <strong lang="es">{result.accentNote}</strong>
        </p>
      )}
      <p className="text-sm text-fg-muted">{explanation}</p>
    </div>
  );
}
