import type { Metadata } from "next";
import { SiteHeader } from "@/components/ui/site-header";
import { AdminPanel } from "@/features/prompt-admin/admin-panel";

export const metadata: Metadata = { title: "Prompt admin · Maestro de Español" };

export default function PromptAdminPage() {
  return (
    <div className="mx-auto w-full max-w-content px-4 py-8 sm:px-6 sm:py-12">
      <SiteHeader heading="Prompt admin" current="/admin/prompts" />
      <main className="mt-4">
        <p className="text-lg text-fg-muted">
          Edit the prompt that writes exercises. Every save is kept, and the next exercise uses the
          active version.
        </p>
        <AdminPanel />
      </main>
    </div>
  );
}
