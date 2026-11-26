import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { ChoiceGroup } from "./choice-group";
import { SiteHeader } from "./site-header";
import { TextInput } from "./text-input";

describe("Button, secondary", () => {
  it("is a button with the surface style instead of the accent", () => {
    render(<Button variant="secondary">Try again</Button>);
    const button = screen.getByRole("button", { name: "Try again" });
    expect(button).toHaveClass("bg-surface");
    expect(button).not.toHaveClass("bg-accent");
  });
});

describe("TextInput", () => {
  it("is a single-line text field named by its label", async () => {
    render(
      <>
        <label htmlFor="topic">Topic</label>
        <TextInput id="topic" />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Topic" });
    await userEvent.type(input, "por y para");
    expect(input).toHaveValue("por y para");
  });
});

describe("ChoiceGroup", () => {
  const options = ["fui", "iba", "voy"];

  it("is a radio group named by its legend, one radio per option", () => {
    render(
      <ChoiceGroup
        legend="Ayer ___ al cine."
        name="q1"
        options={options}
        value={undefined}
        onChange={() => undefined}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Ayer ___ al cine." });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual([
      "0",
      "1",
      "2",
    ]);
    expect(screen.getByRole("radio", { name: "iba" })).not.toBeChecked();
  });

  it("reports the chosen option's index and works from the keyboard", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ChoiceGroup legend="Q" name="q1" options={options} value={undefined} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("radio", { name: "iba" }));
    expect(onChange).toHaveBeenLastCalledWith(1);

    rerender(<ChoiceGroup legend="Q" name="q1" options={options} value={1} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "iba" })).toBeChecked();
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("can be locked", () => {
    render(
      <ChoiceGroup
        legend="Q"
        name="q1"
        options={options}
        value={0}
        onChange={() => undefined}
        disabled
      />,
    );
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });
});

describe("SiteHeader", () => {
  it("has the page heading, a navigation to every page and the theme control", () => {
    render(<SiteHeader heading="Exercises" current="/exercises" />);

    expect(screen.getByRole("heading", { level: 1, name: "Exercises" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = [...nav.querySelectorAll("a")].map((link) => [
      link.textContent,
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Sentence checker", "/"],
      ["Exercises", "/exercises"],
      ["Prompt admin", "/admin/prompts"],
    ]);
    expect(screen.getByRole("link", { name: "Exercises" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Sentence checker" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
  });
});
