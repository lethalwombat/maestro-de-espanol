import { LoaderCircle } from "lucide-react";

/** A turning ring in currentColor. Hidden from assistive tech: the text beside it says what's loading. */
export function Spinner() {
  return <LoaderCircle aria-hidden="true" data-testid="spinner" className="size-4 animate-spin" />;
}
