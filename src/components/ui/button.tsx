import type { ComponentProps } from "react";
import { Spinner } from "./spinner";

type ButtonProps = ComponentProps<"button"> & { loading?: boolean };

/** The primary action. While `loading`, it's disabled and shows a spinner before its label. */
export function Button({
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled === true || loading}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md bg-accent px-5 text-base font-medium text-on-accent transition-[background-color,transform] duration-(--duration-fast) ease-(--ease-out) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring enabled:cursor-pointer enabled:hover:bg-accent-hover enabled:active:scale-[0.98] enabled:active:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
