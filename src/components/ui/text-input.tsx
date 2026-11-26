import type { ComponentProps } from "react";
import { FIELD_CLASSES } from "./text-area";

/** Single-line text input, styled like the text area. Always pair it with a visible <label>. */
export function TextInput({ className = "", type = "text", ...props }: ComponentProps<"input">) {
  return <input {...props} type={type} className={`min-h-11 ${FIELD_CLASSES} ${className}`} />;
}
