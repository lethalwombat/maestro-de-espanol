import type { ComponentProps } from "react";

/** Shared by the text area and the text input. */
export const FIELD_CLASSES =
  "block w-full rounded-md border border-border-strong bg-surface px-3 py-2.5 text-base text-fg transition-colors duration-(--duration-fast) ease-(--ease-out) placeholder:text-fg-muted hover:border-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Multi-line input. Always pair it with a visible <label>. */
export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`resize-y ${FIELD_CLASSES} ${className}`} />;
}
