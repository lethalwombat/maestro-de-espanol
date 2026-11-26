import { Card } from "./card";

/** A card-shaped placeholder for content that's loading. Static: only the spinner loops. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <Card aria-busy="true" className={className}>
      <div className="h-4 w-2/3 rounded-sm bg-surface-muted" />
      <div className="mt-3 h-3 w-full rounded-sm bg-surface-muted" />
      <div className="mt-2 h-3 w-5/6 rounded-sm bg-surface-muted" />
    </Card>
  );
}
