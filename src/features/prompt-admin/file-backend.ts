import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { PromptVersionSchema } from "./schema";
import type { PromptBackend } from "./store";

const FileSchema = z.object({
  activeId: z.string().nullable(),
  versions: z.array(PromptVersionSchema),
});

type FileContents = z.infer<typeof FileSchema>;

/** One JSON file, for local development. Writes go through a temporary file and a rename. */
export function createFileBackend(path: string): PromptBackend {
  async function load(): Promise<FileContents> {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { activeId: null, versions: [] };
      throw error;
    }
    return FileSchema.parse(JSON.parse(raw));
  }

  async function store(contents: FileContents): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${String(process.pid)}.tmp`;
    await writeFile(temporary, JSON.stringify(contents, null, 2) + "\n");
    await rename(temporary, path);
  }

  return {
    async addVersion(version) {
      const contents = await load();
      await store({ ...contents, versions: [...contents.versions, version] });
    },
    async getVersion(id) {
      return (await load()).versions.find((version) => version.id === id) ?? null;
    },
    async listVersions() {
      return (await load()).versions;
    },
    async getActiveId() {
      return (await load()).activeId;
    },
    async setActiveId(id) {
      await store({ ...(await load()), activeId: id });
    },
  };
}
