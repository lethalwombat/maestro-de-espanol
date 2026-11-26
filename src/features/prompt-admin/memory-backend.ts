import type { PromptBackend, PromptVersion } from "./store";

/** Lives as long as the process. For e2e tests and local runs without a file. */
export function createMemoryBackend(): PromptBackend {
  const versions = new Map<string, PromptVersion>();
  let activeId: string | null = null;

  return {
    addVersion(version) {
      versions.set(version.id, { ...version });
      return Promise.resolve();
    },
    getVersion(id) {
      const version = versions.get(id);
      return Promise.resolve(version ? { ...version } : null);
    },
    listVersions() {
      return Promise.resolve([...versions.values()].map((version) => ({ ...version })));
    },
    getActiveId() {
      return Promise.resolve(activeId);
    },
    setActiveId(id) {
      activeId = id;
      return Promise.resolve();
    },
  };
}
