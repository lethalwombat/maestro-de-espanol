import { SiteHeader } from "@/components/ui/site-header";
import { FeedbackForm } from "@/features/sentence-feedback/feedback-form";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-content px-4 py-8 sm:px-6 sm:py-12">
      <SiteHeader heading="Maestro de Español" current="/" />
      <main className="mt-4">
        <p className="text-lg text-fg-muted">
          Write a sentence in Spanish and get corrections, with the reasoning behind each one.
        </p>
        <FeedbackForm />
      </main>
    </div>
  );
}
