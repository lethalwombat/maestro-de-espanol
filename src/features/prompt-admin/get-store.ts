import { DEFAULT_EXERCISE_PROMPT } from "@/features/exercises/prompt";
import { createFileBackend } from "./file-backend";
import { createMemoryBackend } from "./memory-backend";
import { createPromptStore, type PromptBackend, type PromptStore } from "./store";
import { createAzureTableClient, createTableBackend } from "./table-backend";

export type StoreConfig =
  { kind: "memory" } | { kind: "file"; path: string } | { kind: "table"; endpoint: string };

const DEFAULT_FILE = ".data/prompts.json";

/**
 * PROMPT_STORE picks the backend: unset or "memory" (the default, so tests never
 * reach Azure), "file" (PROMPT_STORE_FILE, for local development) or "table"
 * (PROMPT_TABLE_ENDPOINT, set by infra/main.bicep in Azure).
 */
export function resolveStoreConfig(env: Record<string, string | undefined>): StoreConfig {
  const kind = env.PROMPT_STORE ?? "memory";
  switch (kind) {
    case "memory":
      return { kind };
    case "file":
      return { kind, path: env.PROMPT_STORE_FILE ?? DEFAULT_FILE };
    case "table": {
      const endpoint = env.PROMPT_TABLE_ENDPOINT;
      if (!endpoint) throw new Error("PROMPT_STORE=table needs PROMPT_TABLE_ENDPOINT.");
      return { kind, endpoint };
    }
    default:
      throw new Error(`Unknown PROMPT_STORE ${JSON.stringify(kind)}: use memory, file or table.`);
  }
}

export function createConfiguredBackend(config: StoreConfig): PromptBackend {
  switch (config.kind) {
    case "memory":
      return createMemoryBackend();
    case "file":
      return createFileBackend(config.path);
    case "table":
      return createTableBackend(createAzureTableClient(config.endpoint));
  }
}

let store: PromptStore | undefined;

/** The process-wide exercise prompt store, created on first use. Server-side only. */
export function getExercisePromptStore(): PromptStore {
  store ??= createPromptStore(createConfiguredBackend(resolveStoreConfig(process.env)), {
    defaultText: DEFAULT_EXERCISE_PROMPT,
  });
  return store;
}
