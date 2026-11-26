import type { Exercise, ExerciseItem, FillBlankItem } from "./schema";

/** One answer per item, by position: an option index, typed text, or nothing. */
export type Answer = number | string | undefined;

export interface ItemResult {
  correct: boolean;
  /** The learner's answer as shown back to them, or null when they left it blank. */
  given: string | null;
  /** The answer key's answer, as written there. */
  expected: string;
  /** Set when a fill-in-the-blank answer was right except for its accents: the accented form. */
  accentNote: string | null;
}

export interface GradedExercise {
  results: ItemResult[];
  score: number;
  total: number;
}

/** Trim, collapse runs of whitespace, lowercase, and drop the opening ¿ and ¡. */
export function normaliseAnswer(value: string): string {
  return value.replace(/[¿¡]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// The acute accent and the diaeresis only. Ñ stays a letter of its own:
// "ano" and "año" are different words, not an accent slip.
const ACCENT_MARKS = /[́̈]/g;

function withoutAccents(value: string): string {
  return value.normalize("NFD").replace(ACCENT_MARKS, "").normalize("NFC");
}

function tidy(value: string | undefined): string | null {
  const shown = value?.replace(/\s+/g, " ").trim() ?? "";
  return shown === "" ? null : shown;
}

export function gradeFillBlank(
  item: FillBlankItem,
  answer: string | undefined,
): { correct: boolean; accentNote: string | null } {
  const given = normaliseAnswer(answer ?? "");
  if (given === "") return { correct: false, accentNote: null };

  const accepted = [item.answer, ...(item.alternatives ?? [])];
  const normalisedGiven = given.normalize("NFC");
  if (accepted.some((option) => normaliseAnswer(option).normalize("NFC") === normalisedGiven)) {
    return { correct: true, accentNote: null };
  }

  const bareGiven = withoutAccents(given);
  const nearMiss = accepted.find((option) => withoutAccents(normaliseAnswer(option)) === bareGiven);
  if (nearMiss !== undefined) return { correct: true, accentNote: nearMiss };
  return { correct: false, accentNote: null };
}

function gradeItem(item: ExerciseItem, answer: Answer): ItemResult {
  if (item.type === "multiple_choice") {
    const chosen = typeof answer === "number" ? item.options[answer] : undefined;
    return {
      correct: answer === item.correct_option,
      given: chosen ?? null,
      expected: item.options[item.correct_option] ?? "",
      accentNote: null,
    };
  }
  const typed = typeof answer === "string" ? answer : undefined;
  return { ...gradeFillBlank(item, typed), given: tidy(typed), expected: item.answer };
}

/** Grades in code against the answer key. Unanswered items count as wrong. */
export function gradeExercise(exercise: Exercise, answers: readonly Answer[]): GradedExercise {
  const results = exercise.items.map((item, index) => gradeItem(item, answers[index]));
  return {
    results,
    score: results.filter((result) => result.correct).length,
    total: results.length,
  };
}
