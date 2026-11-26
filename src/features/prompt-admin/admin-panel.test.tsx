import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPanel } from "./admin-panel";
import type { AdminResponse, AdminState } from "./schema";

const DEFAULT_STATE: AdminState = {
  active: { source: "default", text: "Default prompt from code." },
  versions: [],
};

const SAVED_STATE: AdminState = {
  active: {
    source: "saved",
    id: "v2",
    text: "Second prompt\nwith more lines.",
    savedAt: "2026-11-26T10:05:00.000Z",
  },
  versions: [
    { id: "v2", savedAt: "2026-11-26T10:05:00.000Z", firstLine: "Second prompt" },
    { id: "v1", savedAt: "2026-11-26T10:00:00.000Z", firstLine: "First prompt" },
  ],
};

type Route = (body: unknown) => { status?: number; body: AdminResponse } | "network-error";

function stubApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    const route = routes[key];
    if (!route) return Promise.reject(new Error(`unexpected ${key}`));
    const reply = route(typeof init?.body === "string" ? JSON.parse(init.body) : undefined);
    if (reply === "network-error") return Promise.reject(new TypeError("offline"));
    return Promise.resolve(Response.json(reply.body, { status: reply.status ?? 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function editor() {
  return screen.findByRole("textbox", { name: "Exercise prompt" });
}

describe("AdminPanel", () => {
  it("shows the default prompt and says it's the default", async () => {
    stubApi({ "GET /api/admin/prompts": () => ({ body: DEFAULT_STATE }) });
    render(<AdminPanel />);

    expect(await editor()).toHaveValue("Default prompt from code.");
    expect(screen.getByText(/the default prompt from code/i)).toBeInTheDocument();
    expect(screen.getByText(/no saved versions yet/i)).toBeInTheDocument();
  });

  it("shows a saved active version with its save time, and lists versions newest first", async () => {
    stubApi({ "GET /api/admin/prompts": () => ({ body: SAVED_STATE }) });
    render(<AdminPanel />);

    expect(await editor()).toHaveValue("Second prompt\nwith more lines.");
    const activeTime = screen.getByText(/a saved version from/i).querySelector("time");
    expect(activeTime).toHaveAttribute("datetime", "2026-11-26T10:05:00.000Z");

    const list = screen.getByRole("list", { name: "Saved versions" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("time")?.getAttribute("datetime"))).toEqual([
      "2026-11-26T10:05:00.000Z",
      "2026-11-26T10:00:00.000Z",
    ]);
    expect(rows[0]).toHaveTextContent("Second prompt");
    expect(rows[1]).toHaveTextContent("First prompt");
  });

  it("saves the edited prompt and shows the new state", async () => {
    const fetchMock = stubApi({
      "GET /api/admin/prompts": () => ({ body: DEFAULT_STATE }),
      "POST /api/admin/prompts": () => ({ body: SAVED_STATE }),
    });
    const user = userEvent.setup();
    render(<AdminPanel />);
    const field = await editor();
    await user.clear(field);
    await user.type(field, "Second prompt");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/prompts",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "Second prompt" }) }),
    );
    expect(field).toHaveValue("Second prompt\nwith more lines.");
  });

  it.each([
    ["empty", "", "Write a prompt first."],
    ["over 20,000 characters", "a".repeat(20_001), "Keep the prompt under 20,000 characters."],
  ])(
    "refuses to save a prompt that is %s, with a validation message",
    async (_name, text, message) => {
      const fetchMock = stubApi({ "GET /api/admin/prompts": () => ({ body: DEFAULT_STATE }) });
      const user = userEvent.setup();
      render(<AdminPanel />);
      const field = await editor();
      await user.clear(field);
      if (text) {
        field.focus();
        await user.paste(text);
      }
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      "the store fails",
      () => ({
        status: 503,
        body: {
          error: "unavailable" as const,
          message: "The prompt store couldn't be reached. Your text hasn't been saved; try again.",
        },
      }),
    ],
    ["the network fails", () => "network-error" as const],
  ])("shows an error alert and keeps the unsaved text when %s", async (_name, reply) => {
    stubApi({
      "GET /api/admin/prompts": () => ({ body: DEFAULT_STATE }),
      "POST /api/admin/prompts": reply,
    });
    const user = userEvent.setup();
    render(<AdminPanel />);
    const field = await editor();
    await user.clear(field);
    await user.type(field, "My unsaved draft");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/hasn't been saved|couldn't reach/i);
    expect(field).toHaveValue("My unsaved draft");
  });

  it("restores a version", async () => {
    const restored: AdminState = {
      active: {
        source: "saved",
        id: "v3",
        text: "First prompt",
        savedAt: "2026-11-26T10:10:00.000Z",
      },
      versions: [
        { id: "v3", savedAt: "2026-11-26T10:10:00.000Z", firstLine: "First prompt" },
        ...SAVED_STATE.versions,
      ],
    };
    const fetchMock = stubApi({
      "GET /api/admin/prompts": () => ({ body: SAVED_STATE }),
      "POST /api/admin/prompts/restore": () => ({ body: restored }),
    });
    const user = userEvent.setup();
    render(<AdminPanel />);
    await editor();
    const rows = within(screen.getByRole("list", { name: "Saved versions" })).getAllByRole(
      "listitem",
    );
    await user.click(within(rows[1] as HTMLElement).getByRole("button", { name: "Restore" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Restored.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/prompts/restore",
      expect.objectContaining({ body: JSON.stringify({ id: "v1" }) }),
    );
    expect(await editor()).toHaveValue("First prompt");
    expect(
      within(screen.getByRole("list", { name: "Saved versions" })).getAllByRole("listitem"),
    ).toHaveLength(3);
  });

  it("restores the default", async () => {
    stubApi({
      "GET /api/admin/prompts": () => ({ body: SAVED_STATE }),
      "POST /api/admin/prompts/restore-default": () => ({
        body: { ...SAVED_STATE, active: { source: "default", text: "Default prompt from code." } },
      }),
    });
    const user = userEvent.setup();
    render(<AdminPanel />);
    await editor();
    await user.click(screen.getByRole("button", { name: "Restore default" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Restored the default.");
    expect(await editor()).toHaveValue("Default prompt from code.");
  });

  it("shows an alert when the prompts can't be loaded", async () => {
    stubApi({
      "GET /api/admin/prompts": () => ({
        status: 503,
        body: { error: "unavailable", message: "The prompt store couldn't be reached." },
      }),
    });
    render(<AdminPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't be reached");
  });
});
