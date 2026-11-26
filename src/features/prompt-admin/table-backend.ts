import { odata, TableClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";
import { PromptVersionSchema } from "./schema";
import type { PromptBackend } from "./store";

export const PROMPT_TABLE_NAME = "prompts";

const VERSIONS = "exercise-version";
const POINTER = "exercise-active";
const POINTER_ROW = "current";

interface Entity {
  partitionKey: string;
  rowKey: string;
  [property: string]: unknown;
}

/** The part of the SDK's TableClient this backend uses, so tests can supply a fake. */
export interface TableLike {
  createEntity(entity: Entity): Promise<unknown>;
  upsertEntity(entity: Entity, mode?: "Merge" | "Replace"): Promise<unknown>;
  getEntity(partitionKey: string, rowKey: string): Promise<Record<string, unknown>>;
  listEntities(options?: {
    queryOptions?: { filter?: string };
  }): AsyncIterable<Record<string, unknown>>;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404
  );
}

async function getOrNull(
  table: TableLike,
  partitionKey: string,
  rowKey: string,
): Promise<Record<string, unknown> | null> {
  try {
    return await table.getEntity(partitionKey, rowKey);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function toVersion(entity: Record<string, unknown>) {
  return PromptVersionSchema.parse({
    id: entity.rowKey,
    text: entity.text,
    savedAt: entity.savedAt,
  });
}

/**
 * Azure Table Storage. Versions are rows in one partition; the active choice is
 * a pointer row in another, so restoring never rewrites a version.
 */
export function createTableBackend(table: TableLike): PromptBackend {
  return {
    async addVersion(version) {
      await table.createEntity({
        partitionKey: VERSIONS,
        rowKey: version.id,
        text: version.text,
        savedAt: version.savedAt,
      });
    },
    async getVersion(id) {
      const entity = await getOrNull(table, VERSIONS, id);
      return entity === null ? null : toVersion(entity);
    },
    async listVersions() {
      const versions = [];
      for await (const entity of table.listEntities({
        queryOptions: { filter: odata`PartitionKey eq ${VERSIONS}` },
      })) {
        versions.push(toVersion(entity));
      }
      return versions;
    },
    async getActiveId() {
      const pointer = await getOrNull(table, POINTER, POINTER_ROW);
      const id = pointer?.versionId;
      return typeof id === "string" && id !== "" ? id : null;
    },
    async setActiveId(id) {
      await table.upsertEntity(
        { partitionKey: POINTER, rowKey: POINTER_ROW, versionId: id ?? "" },
        "Replace",
      );
    },
  };
}

/**
 * The real table, reached with the container app's managed identity through
 * DefaultAzureCredential. No account key or connection string is ever used.
 */
export function createAzureTableClient(endpoint: string): TableLike {
  return new TableClient(endpoint, PROMPT_TABLE_NAME, new DefaultAzureCredential());
}
