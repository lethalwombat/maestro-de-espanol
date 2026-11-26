import { randomUUID } from "node:crypto";
import { PromptTextSchema, type PromptVersion } from "./schema";

export type { PromptVersion } from "./schema";

/**
 * Where versions live. Backends only store and fetch; the rules (validation,
 * restore-as-copy, newest first) live in the store, so every backend behaves alike.
 */
export interface PromptBackend {
  addVersion(version: PromptVersion): Promise<void>;
  getVersion(id: string): Promise<PromptVersion | null>;
  /** In any order. */
  listVersions(): Promise<PromptVersion[]>;
  /** The active version's id, or null when the code default is active. */
  getActiveId(): Promise<string | null>;
  setActiveId(id: string | null): Promise<void>;
}

export type ActivePrompt =
  { source: "default"; text: string } | { source: "saved"; version: PromptVersion };

export interface PromptStore {
  getActive(): Promise<ActivePrompt>;
  /** Newest first. */
  listVersions(): Promise<PromptVersion[]>;
  /** Validates, stores a new version and makes it active. */
  save(text: string): Promise<PromptVersion>;
  /** Saves a copy of an earlier version as the new active one. History is never rewritten. */
  restore(id: string): Promise<PromptVersion>;
  restoreDefault(): Promise<void>;
}

export class VersionNotFoundError extends Error {
  constructor(id: string) {
    super(`Prompt version ${JSON.stringify(id)} not found.`);
    this.name = "VersionNotFoundError";
  }
}

interface StoreOptions {
  defaultText: string;
  now?: () => Date;
}

function newestFirst(a: PromptVersion, b: PromptVersion): number {
  return b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id);
}

export function createPromptStore(backend: PromptBackend, options: StoreOptions): PromptStore {
  const now = options.now ?? (() => new Date());

  async function add(rawText: string): Promise<PromptVersion> {
    const text = PromptTextSchema.parse(rawText);
    const savedAt = now();
    const version: PromptVersion = {
      // Sortable and safe as a Table Storage row key.
      id: `${String(savedAt.getTime()).padStart(15, "0")}-${randomUUID().slice(0, 8)}`,
      text,
      savedAt: savedAt.toISOString(),
    };
    await backend.addVersion(version);
    await backend.setActiveId(version.id);
    return version;
  }

  return {
    async getActive() {
      const id = await backend.getActiveId();
      const version = id === null ? null : await backend.getVersion(id);
      return version === null
        ? { source: "default", text: options.defaultText }
        : { source: "saved", version };
    },
    async listVersions() {
      return (await backend.listVersions()).sort(newestFirst);
    },
    save: add,
    async restore(id) {
      const version = await backend.getVersion(id);
      if (version === null) throw new VersionNotFoundError(id);
      return add(version.text);
    },
    async restoreDefault() {
      await backend.setActiveId(null);
    },
  };
}
