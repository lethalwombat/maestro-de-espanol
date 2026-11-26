import { describe, expect, it, vi } from "vitest";
import type * as TableBackend from "./table-backend";

const tableClient = vi.hoisted(() => vi.fn());
vi.mock("./table-backend", async (importOriginal) => ({
  ...(await importOriginal<typeof TableBackend>()),
  createAzureTableClient: tableClient,
}));

const { resolveStoreConfig, createConfiguredBackend } = await import("./get-store");

describe("resolveStoreConfig", () => {
  it("uses the in-memory store when nothing is configured", () => {
    expect(resolveStoreConfig({})).toEqual({ kind: "memory" });
  });

  it("uses a file store at the configured path, or a default one", () => {
    expect(resolveStoreConfig({ PROMPT_STORE: "file", PROMPT_STORE_FILE: "/tmp/p.json" })).toEqual({
      kind: "file",
      path: "/tmp/p.json",
    });
    expect(resolveStoreConfig({ PROMPT_STORE: "file" })).toEqual({
      kind: "file",
      path: ".data/prompts.json",
    });
  });

  it("uses Azure Table Storage at the configured endpoint", () => {
    expect(
      resolveStoreConfig({
        PROMPT_STORE: "table",
        PROMPT_TABLE_ENDPOINT: "https://example.table.core.windows.net",
      }),
    ).toEqual({ kind: "table", endpoint: "https://example.table.core.windows.net" });
  });

  it("refuses a table store without an endpoint", () => {
    expect(() => resolveStoreConfig({ PROMPT_STORE: "table" })).toThrow(/PROMPT_TABLE_ENDPOINT/);
  });

  it("refuses an unknown store kind", () => {
    expect(() => resolveStoreConfig({ PROMPT_STORE: "postgres" })).toThrow(/PROMPT_STORE/);
  });
});

describe("createConfiguredBackend", () => {
  it("builds the table backend from the endpoint alone, with no key or connection string", () => {
    tableClient.mockReturnValue({});
    createConfiguredBackend({ kind: "table", endpoint: "https://example.table.core.windows.net" });
    expect(tableClient).toHaveBeenCalledWith("https://example.table.core.windows.net");
  });

  it("builds memory and file backends", () => {
    expect(createConfiguredBackend({ kind: "memory" })).toHaveProperty("addVersion");
    expect(createConfiguredBackend({ kind: "file", path: "/tmp/x.json" })).toHaveProperty(
      "addVersion",
    );
  });
});
