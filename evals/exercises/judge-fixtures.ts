// Hand-written exercises with known verdicts, for calibrating the judge
// (judge-calibration.eval.ts). Two are right; two have one planted wrong key.
import type { Exercise } from "@/features/exercises/schema";

export interface JudgeFixture {
  id: string;
  topic: string;
  exercise: Exercise;
  /** The index of the planted wrong key, or null when every key is right. */
  wrongKey: number | null;
}

const SER_ESTAR: Exercise = {
  title: "Ser y estar",
  instructions: "Choose or write the right form of ser or estar.",
  items: [
    {
      type: "multiple_choice",
      prompt: "Mi madre ___ de Colombia.",
      options: ["es", "está"],
      correct_option: 0,
      explanation: "Origin takes ser.",
    },
    {
      type: "fill_blank",
      sentence: "Hoy la biblioteca ___ cerrada por obras.",
      answer: "está",
      alternatives: [],
      explanation: "A temporary state takes estar.",
    },
    {
      type: "multiple_choice",
      prompt: "La reunión ___ en la sala 4.",
      options: ["es", "está"],
      correct_option: 0,
      explanation: "Where an event takes place uses ser.",
    },
    {
      type: "fill_blank",
      sentence: "Mis primos ___ estudiantes de medicina.",
      answer: "son",
      alternatives: [],
      explanation: "Professions and identity take ser.",
    },
    {
      type: "fill_blank",
      sentence: "¿Dónde ___ las llaves del coche?",
      answer: "están",
      alternatives: [],
      explanation: "The location of a thing takes estar.",
    },
  ],
};

const POR_PARA: Exercise = {
  title: "Por y para",
  instructions: "Choose por or para.",
  items: [
    {
      type: "multiple_choice",
      prompt: "Gracias ___ tu ayuda.",
      options: ["por", "para"],
      correct_option: 0,
      explanation: "Gratitude for something takes por.",
    },
    {
      type: "multiple_choice",
      prompt: "Este regalo es ___ mi hermana.",
      options: ["por", "para"],
      correct_option: 1,
      explanation: "The recipient takes para.",
    },
    {
      type: "fill_blank",
      sentence: "Estudio mucho ___ aprobar el examen.",
      answer: "para",
      alternatives: [],
      explanation: "A purpose before an infinitive takes para.",
    },
    {
      type: "fill_blank",
      sentence: "Paseamos ___ el parque toda la tarde.",
      answer: "por",
      alternatives: [],
      explanation: "Movement through a place takes por.",
    },
    {
      type: "multiple_choice",
      prompt: "Tengo que terminar el informe ___ el viernes.",
      options: ["por", "para"],
      correct_option: 1,
      explanation: "A deadline takes para.",
    },
  ],
};

function withItem(exercise: Exercise, index: number, item: Exercise["items"][number]): Exercise {
  return { ...exercise, items: exercise.items.map((old, at) => (at === index ? item : old)) };
}

export const JUDGE_FIXTURES: JudgeFixture[] = [
  { id: "ser-estar-good", topic: "ser vs estar", exercise: SER_ESTAR, wrongKey: null },
  { id: "por-para-good", topic: "por y para", exercise: POR_PARA, wrongKey: null },
  {
    id: "ser-estar-wrong-key",
    topic: "ser vs estar",
    wrongKey: 1,
    exercise: withItem(SER_ESTAR, 1, {
      type: "fill_blank",
      sentence: "Hoy la biblioteca ___ cerrada por obras.",
      answer: "es",
      alternatives: [],
      explanation: "Closed takes ser.",
    }),
  },
  {
    id: "por-para-wrong-key",
    topic: "por y para",
    wrongKey: 0,
    exercise: withItem(POR_PARA, 0, {
      type: "multiple_choice",
      prompt: "Gracias ___ tu ayuda.",
      options: ["por", "para"],
      correct_option: 1,
      explanation: "Gratitude takes para.",
    }),
  },
];
