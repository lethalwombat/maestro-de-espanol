import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { Message } from "./message";
import { Skeleton } from "./skeleton";

describe("Button", () => {
  it("is disabled and shows a spinner beside its label while loading", () => {
    render(<Button loading>Checking…</Button>);

    const button = screen.getByRole("button", { name: "Checking…" });
    expect(button).toBeDisabled();
    expect(screen.getByTestId("spinner")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows no spinner otherwise", () => {
    render(<Button>Check my sentence</Button>);

    expect(screen.getByRole("button", { name: "Check my sentence" })).toBeEnabled();
    expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
  });
});

describe("Message", () => {
  it.each([
    ["success", "status", "lucide-circle-check"],
    ["info", "status", "lucide-info"],
    ["danger", "alert", "lucide-circle-alert"],
  ] as const)("a %s message has role %s and a hidden %s icon", (tone, role, icon) => {
    render(<Message tone={tone}>Words that say what happened.</Message>);

    const message = screen.getByRole(role);
    expect(message).toHaveTextContent("Words that say what happened.");
    const svg = message.querySelector("svg");
    expect(svg).toHaveClass(icon);
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Skeleton", () => {
  it("marks the region busy without announcing itself as a status", () => {
    const { container } = render(<Skeleton />);

    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
