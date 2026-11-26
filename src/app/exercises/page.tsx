import type { Metadata } from "next";
import { SiteHeader } from "@/components/ui/site-header";
import { ExerciseForm } from "@/features/exercises/exercise-form";

export const metadata: Metadata = { title: "Exercises · Maestro de Español" };

export default function ExercisesPage() {
  return (
    <div className="mx-auto w-full max-w-content px-4 py-8 sm:px-6 sm:py-12">
      <SiteHeader heading="Exercises" current="/exercises" />
      <main className="mt-4">
        <p className="text-lg text-fg-muted">
          Name a Spanish grammar point or a vocabulary theme and practise it with a short exercise.
        </p>
        <ExerciseForm />
      </main>
    </div>
  );
}
