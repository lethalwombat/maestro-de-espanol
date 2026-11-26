// Test-only: an in-memory stand-in for the Azure TableClient, with the same
// not-found and conflict behaviour the backend relies on.
import type { TableLike } from "./table-backend";

type Row = Record<string, unknown> & { partitionKey: string; rowKey: string };

function restError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { name: "RestError", statusCode });
}

export function fakeTableClient(): TableLike & { rows: Map<string, Row> } {
  const rows = new Map<string, Row>();
  const key = (partitionKey: string, rowKey: string) => `${partitionKey}\u0000${rowKey}`;

  return {
    rows,
    createEntity(entity) {
      const id = key(entity.partitionKey, entity.rowKey);
      if (rows.has(id)) return Promise.reject(restError(409, "EntityAlreadyExists"));
      rows.set(id, { ...entity });
      return Promise.resolve({});
    },
    upsertEntity(entity) {
      rows.set(key(entity.partitionKey, entity.rowKey), { ...entity });
      return Promise.resolve({});
    },
    getEntity(partitionKey, rowKey) {
      const row = rows.get(key(partitionKey, rowKey));
      return row ? Promise.resolve({ ...row }) : Promise.reject(restError(404, "ResourceNotFound"));
    },
    async *listEntities(options) {
      await Promise.resolve();
      const match = /^PartitionKey eq '(.*)'$/.exec(options?.queryOptions?.filter ?? "");
      for (const row of rows.values()) {
        if (!match || row.partitionKey === match[1]) yield { ...row };
      }
    },
  };
}
