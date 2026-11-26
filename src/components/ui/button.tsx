import type { ComponentProps } from "react";
import { Spinner } from "./spinner";

type ButtonProps = ComponentProps<"button"> & {
  loading?: boolean;
  /** primary: the page's main action. secondary: a quieter action beside it. */
  variant?: "primary" | "secondary";
};

const VARIANTS = {
  primary: "bg-accent text-on-accent enabled:hover:bg-accent-hover enabled:active:bg-accent-hover",
  secondary:
    "border border-border-strong bg-surface text-fg enabled:hover:bg-surface-muted enabled:active:bg-surface-muted",
} as const;

/** An action. While `loading`, it's disabled and shows a spinner before its label. */
export function Button({
  loading = false,
  variant = "primary",
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled === true || loading}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-5 text-base font-medium transition-[background-color,scale] duration-(--duration-fast) ease-(--ease-out) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring enabled:cursor-pointer enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
