import { ThemeToggle } from "@/components/ui/theme-toggle";
import { FeedbackForm } from "@/features/sentence-feedback/feedback-form";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-content px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Maestro de Español</h1>
        <ThemeToggle />
      </header>
      <main className="mt-4">
        <p className="text-lg text-fg-muted">
          Write a sentence in Spanish and get corrections, with the reasoning behind each one.
        </p>
        <FeedbackForm />
      </main>
    </div>
  );
}
