import { FeedbackForm } from "@/features/sentence-feedback/feedback-form";

export default function Home() {
  return (
    <main className="page">
      <h1>Maestro de Español</h1>
      <p className="lede">
        Write a sentence in Spanish and get corrections, with the reasoning behind each one.
      </p>
      <FeedbackForm />
    </main>
  );
}
