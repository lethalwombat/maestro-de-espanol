// Tests the exercise grader and judge plumbing without calling Claude. A grader
// that can't tell a good exercise from a bad one makes the eval meaningless.
import { describe, expect, it } from "vitest";
import { ExerciseOutputSchema, ExerciseSchema } from "@/features/exercises/schema";
import { fakeAnthropic, jsonMessage } from "@/lib/llm/testing";
import { gradeExerciseOutput, type JudgedOutput, SUITE } from "./grade";
import { JUDGE_PROMPT, judgeExercise, type JudgeVerdict } from "./judge";
import { JUDGE_FIXTURES } from "./judge-fixtures";

const allPass = (checks: Record<string, boolean>) => Object.values(checks).every(Boolean);
const goodFixture = JUDGE_FIXTURES[0];
if (!goodFixture) throw new Error("no judge fixtures");
const exercise = goodFixture.exercise;

const verdict = (overrides: Partial<JudgeVerdict> = {}): JudgeVerdict => ({
  items_on_topic: true,
  topic_reason: "All items contrast ser and estar.",
  items: exercise.items.map((_, index) => ({
    index,
    key_correct: true,
    unambiguous: true,
    reason: "Correct.",
  })),
  ...overrides,
});

const onTopicCase = { id: "ser-estar", input: "ser vs estar", expect: { onTopic: true } };
const offTopicCase = { id: "python", input: "Python decorators", expect: { onTopic: false } };
const produced = (judge: JudgeVerdict | null): JudgedOutput => ({
  output: { on_topic: true, exercise },
  judge,
});
const declined: JudgedOutput = { output: { on_topic: false, exercise: null }, judge: null };

describe("exercise suite", () => {
  it("has on-topic and off-topic cases, so neither 'always decline' nor 'always answer' scores well", () => {
    expect(new Set(SUITE.cases.map((testCase) => testCase.expect.onTopic))).toEqual(
      new Set([true, false]),
    );
  });

  it("has unique case ids", () => {
    const ids = SUITE.cases.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("gradeExerciseOutput", () => {
  it("passes an on-topic exercise the judge approves", () => {
    expect(gradeExerciseOutput(produced(verdict()), onTopicCase)).toSatisfy(allPass);
  });

  it("passes a declined off-topic case", () => {
    expect(gradeExerciseOutput(declined, offTopicCase)).toSatisfy(allPass);
  });

  it("fails an on-topic case that was declined", () => {
    expect(gradeExerciseOutput(declined, onTopicCase)).toEqual({ produced_exercise: false });
  });

  it("fails an off-topic case that got an exercise", () => {
    expect(gradeExerciseOutput(produced(verdict()), offTopicCase)).toEqual({ declined: false });
  });

  it.each([
    ["off-topic items", verdict({ items_on_topic: false }), "items_on_topic"],
    [
      "a wrong key",
      verdict({
        items: verdict().items.map((item, index) => ({ ...item, key_correct: index !== 2 })),
      }),
      "keys_correct",
    ],
    [
      "an ambiguous item",
      verdict({
        items: verdict().items.map((item, index) => ({ ...item, unambiguous: index !== 0 })),
      }),
      "keys_unambiguous",
    ],
    [
      "a judge that skipped an item",
      verdict({ items: verdict().items.slice(1) }),
      "judge_covers_items",
    ],
  ])("fails an exercise with %s", (_name, judge, failing) => {
    const checks = gradeExerciseOutput(produced(judge), onTopicCase);
    expect(checks[failing]).toBe(false);
  });

  it("fails every judged check when there is no verdict", () => {
    const checks = gradeExerciseOutput(produced(null), onTopicCase);
    expect(checks.keys_correct).toBe(false);
    expect(checks.items_on_topic).toBe(false);
  });
});

describe("judgeExercise", () => {
  it("sends the judge prompt, and the topic and exercise inside tags, and parses the verdict", async () => {
    const { client, requests } = fakeAnthropic(() => jsonMessage(verdict()));
    const result = await judgeExercise(client, "ser vs estar", exercise);

    expect(result.ok && result.data).toEqual(verdict());
    const body = requests[0]?.body as {
      system: Array<{ text: string }>;
      messages: Array<{ content: string }>;
    };
    expect(body.system[0]?.text).toBe(JUDGE_PROMPT);
    expect(body.messages[0]?.content).toMatch(/^<topic>ser vs estar<\/topic>\n<exercise>\{/);
    expect(body.messages[0]?.content).toContain("Mi madre ___ de Colombia.");
  });
});

describe("judge fixtures", () => {
  it.each(JUDGE_FIXTURES.map((fixture) => [fixture.id, fixture] as const))(
    "%s is a valid exercise the app could have produced",
    (_id, fixture) => {
      expect(ExerciseSchema.safeParse(fixture.exercise).success).toBe(true);
      expect(
        ExerciseOutputSchema.safeParse({ on_topic: true, exercise: fixture.exercise }).success,
      ).toBe(true);
      expect(fixture.wrongKey ?? 0).toBeLessThan(fixture.exercise.items.length);
    },
  );

  it("has both good exercises and planted wrong keys", () => {
    expect(new Set(JUDGE_FIXTURES.map((fixture) => fixture.wrongKey === null))).toEqual(
      new Set([true, false]),
    );
  });
});
