// The theme choice: System follows the OS, Light and Dark force one. The
// choice is kept in localStorage and applied as <html data-theme>, which
// tokens.css turns into a color-scheme. Every storage call is guarded: if
// storage throws or holds something unknown, the page follows the OS.

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "theme";

function parseChoice(value: string | null): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

function readChoice(): ThemeChoice {
  try {
    return parseChoice(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "system";
  }
}

function saveChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Not saved, but still applied for the rest of the visit.
  }
}

function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}

/**
 * Applies a saved Light or Dark choice before React loads. It's serialised into
 * an inline <script> by THEME_SCRIPT, so it must stay self-contained: no
 * imports, no outer variables.
 */
export function applySavedTheme(): void {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
  } catch {
    // Storage is unavailable: follow the OS.
  }
}

export const THEME_SCRIPT = `(${applySavedTheme.toString()})()`;

export interface ThemeStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ThemeChoice;
  getServerSnapshot: () => ThemeChoice;
  set: (choice: ThemeChoice) => void;
}

/** A store for useSyncExternalStore. The server always renders System. */
export function createThemeStore(): ThemeStore {
  let current: ThemeChoice | undefined;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => (current ??= readChoice()),
    getServerSnapshot: () => "system",
    set(choice) {
      current = choice;
      saveChoice(choice);
      applyChoice(choice);
      for (const listener of listeners) listener();
    },
  };
}

export const themeStore = createThemeStore();
