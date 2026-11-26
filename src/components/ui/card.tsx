import type { ComponentProps } from "react";

export const CARD_CLASSES = "rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5";

/** A container for a result. */
export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} className={`${CARD_CLASSES} ${className}`} />;
}
