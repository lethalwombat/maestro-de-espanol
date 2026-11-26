import { useId, type ReactNode } from "react";

interface ChoiceGroupProps {
  /** Names the group: the question being answered. */
  legend: ReactNode;
  name: string;
  options: readonly string[];
  /** The chosen option's index, or undefined when nothing is chosen. */
  value: number | undefined;
  onChange: (index: number) => void;
  disabled?: boolean;
}

/** One answer from a short list. Native radios, so arrow keys move between options. */
export function ChoiceGroup({
  legend,
  name,
  options,
  value,
  onChange,
  disabled,
}: ChoiceGroupProps) {
  const legendId = useId();
  return (
    <fieldset role="radiogroup" aria-labelledby={legendId} disabled={disabled} className="min-w-0">
      <legend id={legendId} className="font-medium">
        {legend}
      </legend>
      <div className="mt-2 grid gap-2">
        {options.map((option, index) => (
          <label
            key={`${String(index)}-${option}`}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 transition-colors duration-(--duration-fast) ease-(--ease-out) hover:border-fg-muted has-checked:border-border-strong has-disabled:cursor-not-allowed has-disabled:hover:border-border"
          >
            <input
              type="radio"
              name={name}
              value={String(index)}
              checked={value === index}
              onChange={() => {
                onChange(index);
              }}
              className="size-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
