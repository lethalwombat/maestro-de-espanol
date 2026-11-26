import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySavedTheme, createThemeStore, THEME_SCRIPT } from "./theme";
import { ThemeToggle } from "./theme-toggle";

const root = document.documentElement;

function brokenStorage(): Storage {
  const fail = () => {
    throw new DOMException("denied", "SecurityError");
  };
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

beforeEach(() => {
  localStorage.clear();
  delete root.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("applySavedTheme (the inline script)", () => {
  it("applies a saved Light or Dark choice to <html>", () => {
    localStorage.setItem("theme", "dark");
    applySavedTheme();
    expect(root.dataset.theme).toBe("dark");
  });

  it("leaves <html> alone for an unknown value, so the OS decides", () => {
    localStorage.setItem("theme", "purple");
    applySavedTheme();
    expect(root.dataset.theme).toBeUndefined();
  });

  it("swallows a storage error", () => {
    vi.stubGlobal("localStorage", brokenStorage());
    expect(() => {
      applySavedTheme();
    }).not.toThrow();
    expect(root.dataset.theme).toBeUndefined();
  });

  it("is shipped as a self-invoking script", () => {
    expect(THEME_SCRIPT).toMatch(/^\(function applySavedTheme\(\)[\s\S]*\)\(\)$/);
  });
});

describe("createThemeStore", () => {
  it("starts from the saved choice, or System when there is none", () => {
    expect(createThemeStore().getSnapshot()).toBe("system");
    localStorage.setItem("theme", "light");
    expect(createThemeStore().getSnapshot()).toBe("light");
  });

  it("renders System on the server", () => {
    expect(createThemeStore().getServerSnapshot()).toBe("system");
  });

  it("saves and applies a choice, and System clears both", () => {
    const store = createThemeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
    expect(store.getSnapshot()).toBe("dark");

    store.set("system");
    expect(localStorage.getItem("theme")).toBeNull();
    expect(root.dataset.theme).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.set("light");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("treats an unknown saved value as System", () => {
    localStorage.setItem("theme", "purple");
    expect(createThemeStore().getSnapshot()).toBe("system");
  });

  it("still switches the theme for the visit when storage throws", () => {
    vi.stubGlobal("localStorage", brokenStorage());
    const store = createThemeStore();

    expect(store.getSnapshot()).toBe("system");
    store.set("dark");
    expect(store.getSnapshot()).toBe("dark");
    expect(root.dataset.theme).toBe("dark");
  });
});

describe("ThemeToggle", () => {
  it("is a radio group named Theme with System, Light and Dark", () => {
    render(<ThemeToggle store={createThemeStore()} />);

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });

  it("applies a choice at once and checks it", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle store={createThemeStore()} />);

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(root.dataset.theme).toBe("dark");
  });

  it("shows the saved choice", () => {
    localStorage.setItem("theme", "light");
    render(<ThemeToggle store={createThemeStore()} />);

    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
  });
});
