import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileBackend } from "./file-backend";
import { createMemoryBackend } from "./memory-backend";
import { createPromptStore, type PromptBackend, type PromptStore } from "./store";
import { createTableBackend } from "./table-backend";
import { fakeTableClient } from "./testing";

const DEFAULT = "You are the default exercise prompt.";

let tempDir: string;
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "prompt-store-"));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const backends: Array<[string, () => PromptBackend]> = [
  ["memory", () => createMemoryBackend()],
  ["file", () => createFileBackend(join(tempDir, "nested", "prompts.json"))],
  ["table", () => createTableBackend(fakeTableClient())],
];

describe.each(backends)("prompt store on the %s backend", (_name, makeBackend) => {
  let store: PromptStore;
  let tick: number;

  beforeEach(() => {
    tick = 0;
    store = createPromptStore(makeBackend(), {
      defaultText: DEFAULT,
      now: () => new Date(Date.UTC(2026, 10, 26, 10, 0, tick++)),
    });
  });

  it("makes the code default active when nothing is saved", async () => {
    expect(await store.getActive()).toEqual({ source: "default", text: DEFAULT });
    expect(await store.listVersions()).toEqual([]);
  });

  it("stores a saved prompt as a new version with its save time and makes it active", async () => {
    const saved = await store.save("  Version one  ");
    expect(saved).toMatchObject({ text: "Version one", savedAt: "2026-11-26T10:00:00.000Z" });
    expect(await store.getActive()).toEqual({ source: "saved", version: saved });
  });

  it("lists versions newest first", async () => {
    await store.save("one");
    await store.save("two");
    await store.save("three");
    expect((await store.listVersions()).map((version) => version.text)).toEqual([
      "three",
      "two",
      "one",
    ]);
  });

  it("restores a version as a new copy without rewriting history", async () => {
    const first = await store.save("one");
    await store.save("two");
    const restored = await store.restore(first.id);

    expect(restored.id).not.toBe(first.id);
    expect(restored.text).toBe("one");
    expect(await store.getActive()).toEqual({ source: "saved", version: restored });
    expect((await store.listVersions()).map((version) => version.text)).toEqual([
      "one",
      "two",
      "one",
    ]);
  });

  it("refuses to restore a version that doesn't exist", async () => {
    await expect(store.restore("missing")).rejects.toThrow(/not found/i);
  });

  it("restores the code default, keeping the saved versions", async () => {
    await store.save("one");
    await store.restoreDefault();
    expect(await store.getActive()).toEqual({ source: "default", text: DEFAULT });
    expect(await store.listVersions()).toHaveLength(1);
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "  \n "],
    ["over 20,000 characters", "a".repeat(20_001)],
  ])("refuses to save a prompt that is %s", async (_name, text) => {
    await expect(store.save(text)).rejects.toThrow();
    expect(await store.listVersions()).toEqual([]);
  });

  it("accepts a prompt of exactly 20,000 characters", async () => {
    await expect(store.save("a".repeat(20_000))).resolves.toBeDefined();
  });
});

describe("file backend", () => {
  it("keeps versions and the active choice across instances, as after a restart", async () => {
    const path = join(tempDir, "prompts.json");
    const first = createPromptStore(createFileBackend(path), { defaultText: DEFAULT });
    const saved = await first.save("persisted");

    const second = createPromptStore(createFileBackend(path), { defaultText: DEFAULT });
    expect(await second.getActive()).toEqual({ source: "saved", version: saved });
  });
});

describe("table backend", () => {
  it("keeps versions and the active choice in the table, as after a restart", async () => {
    const table = fakeTableClient();
    const saved = await createPromptStore(createTableBackend(table), {
      defaultText: DEFAULT,
    }).save("persisted");

    const second = createPromptStore(createTableBackend(table), { defaultText: DEFAULT });
    expect(await second.getActive()).toEqual({ source: "saved", version: saved });
  });
});
