"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { type ThemeChoice, type ThemeStore, themeStore } from "./theme";

const OPTIONS = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const satisfies readonly { value: ThemeChoice; label: string; Icon: unknown }[];

/** System, Light or Dark. Native radios, so arrow keys move between options. */
export function ThemeToggle({ store = themeStore }: { store?: ThemeStore }) {
  const choice = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex gap-1 rounded-lg bg-surface-muted p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <label
          key={value}
          className="relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-sm px-2.5 text-sm font-medium text-fg-muted transition-[color,background-color,box-shadow,scale] duration-(--duration-fast) ease-(--ease-out) hover:text-fg active:scale-[0.98] has-checked:bg-surface has-checked:text-fg has-checked:shadow-md"
        >
          <input
            type="radio"
            name="theme"
            value={value}
            checked={choice === value}
            onChange={() => {
              store.set(value);
            }}
            className="absolute inset-0 cursor-pointer appearance-none rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Icon aria-hidden="true" className="pointer-events-none size-5" />
          <span className="pointer-events-none">{label}</span>
        </label>
      ))}
    </div>
  );
}
