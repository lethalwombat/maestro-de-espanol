import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SEARCHED = ["src", "infra", "e2e", "evals", "docs", ".github", ".env.example"];
const SKIPPED = new Set(["node_modules", ".next", "results"]);

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (!statSync(full, { throwIfNoEntry: false })) return [];
  if (statSync(full).isFile()) return [path];
  return readdirSync(full)
    .filter((name) => !SKIPPED.has(name))
    .flatMap((name) => files(join(path, name)));
}

// Markers of a storage account key, connection string or SAS token. Built from
// pieces so this file doesn't match itself.
const SECRET_MARKERS = [
  ["Account", "Key="],
  ["Shared", "AccessSignature="],
  ["Default", "EndpointsProtocol="],
  ["listKeys", "("],
  ["AZURE_STORAGE_", "CONNECTION_STRING"],
].map((parts) => parts.join(""));

describe("the prompt store holds no storage secret", () => {
  it("no tracked source, infra, workflow or doc contains a key, connection string or SAS", () => {
    const hits = SEARCHED.flatMap(files).flatMap((path) => {
      const text = readFileSync(join(ROOT, path), "utf8");
      return SECRET_MARKERS.filter((marker) => text.includes(marker)).map(
        (marker) => `${relative(ROOT, join(ROOT, path))}: ${marker}`,
      );
    });
    expect(hits).toEqual([]);
  });

  it("the storage account refuses shared-key access, so only Entra ID tokens work", () => {
    const bicep = readFileSync(join(ROOT, "infra/main.bicep"), "utf8");
    expect(bicep).toMatch(/allowSharedKeyAccess:\s*false/);
  });

  it("the app's access is one data role scoped to that storage account", () => {
    const bicep = readFileSync(join(ROOT, "infra/main.bicep"), "utf8");
    const assignment = /resource promptStoreAccess [^{]*\{([\s\S]*?)\n\}/.exec(bicep)?.[1] ?? "";
    expect(assignment).toContain("scope: storage");
    expect(assignment).toContain("tableDataContributorRole");
    expect(assignment).toContain("app.identity.principalId");
  });
});
