// Task specs (tasks/, human-owned) and progress files (progress/, agent-owned).
// The format is described in tasks/README.md; this module is its parser and validator.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TASK_FILE = /^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
export const TASK_BRANCH = /^task\/(\d{4})-[a-z0-9-]+$/;
export const PROGRESS_STATUSES = ["in-progress", "blocked", "done"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

const SPEC_SECTIONS = ["objective", "acceptance criteria", "out of scope"] as const;

export interface Criterion {
  id: string;
  text: string;
}

export interface TaskSpec {
  id: string;
  slug: string;
  file: string;
  title: string;
  objective: string;
  criteria: Criterion[];
  outOfScope: string[];
}

export interface ChecklistItem {
  checked: boolean;
  text: string;
}

export interface Progress {
  file: string;
  taskId: string;
  status: ProgressStatus;
  log: string;
  evidence: Map<string, string>;
  /** Null when the progress file has no "Definition of Done" section yet. */
  dod: ChecklistItem[] | null;
}

export interface Task {
  spec: TaskSpec;
  progress: Progress | null;
  status: "todo" | ProgressStatus;
}

interface Parsed<T> {
  value: T | null;
  problems: string[];
}

export function parseFrontmatter(
  markdown: string,
): { data: Record<string, string>; body: string } | null {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(markdown.replace(/\r\n/g, "\n"));
  if (!match) return null;
  const data: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*?)\s*(#.*)?$/.exec(line);
    if (pair) data[pair[1] ?? ""] = (pair[2] ?? "").replace(/^(["'])(.*)\1$/, "$2");
  }
  return { data, body: markdown.replace(/\r\n/g, "\n").slice(match[0].length) };
}

/** "## Heading" sections, keyed by lower-cased heading. */
export function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  let heading: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (heading !== null) sections.set(heading, lines.join("\n").trim());
  };
  for (const line of body.split("\n")) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = (match[1] ?? "").toLowerCase();
      lines = [];
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

function bullets(section: string): string[] {
  return section
    .split("\n")
    .filter((line) => /^\s*[-*]\s+\S/.test(line))
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim());
}

export function parseChecklist(section: string): ChecklistItem[] {
  return section
    .split("\n")
    .map((line) => /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line))
    .filter((match) => match !== null)
    .map((match) => ({ checked: match[1] !== " ", text: match[2] ?? "" }));
}

export function parseSpec(file: string, markdown: string): Parsed<TaskSpec> {
  const problems: string[] = [];
  const name = TASK_FILE.exec(file.split("/").pop() ?? "");
  if (!name)
    return { value: null, problems: [`${file}: file name must look like 0001-short-slug.md`] };
  const [, id = "", slug = ""] = name;

  const front = parseFrontmatter(markdown);
  if (!front) return { value: null, problems: [`${file}: missing frontmatter (--- id/title ---)`] };
  if (front.data.id !== id)
    problems.push(`${file}: frontmatter id "${front.data.id ?? ""}" must be "${id}"`);
  const title = front.data.title ?? "";
  if (title === "") problems.push(`${file}: frontmatter needs a title`);

  const sections = splitSections(front.body);
  for (const section of SPEC_SECTIONS) {
    if (!sections.get(section)) problems.push(`${file}: missing or empty "## ${section}" section`);
  }

  const criteria: Criterion[] = [];
  for (const item of bullets(sections.get("acceptance criteria") ?? "")) {
    const match = /^(?:\[[ xX]\]\s+)?(AC\d+):\s*(.+)$/.exec(item);
    if (!match) {
      problems.push(
        `${file}: acceptance criterion "${item.slice(0, 40)}" must start with "AC<n>: "`,
      );
      continue;
    }
    criteria.push({ id: match[1] ?? "", text: match[2] ?? "" });
  }
  criteria.forEach((criterion, index) => {
    if (criterion.id !== `AC${String(index + 1)}`) {
      problems.push(
        `${file}: criteria must be numbered AC1, AC2, ... in order (found ${criterion.id})`,
      );
    }
  });

  return {
    value: {
      id,
      slug,
      file,
      title,
      objective: sections.get("objective") ?? "",
      criteria,
      outOfScope: bullets(sections.get("out of scope") ?? ""),
    },
    problems,
  };
}

export function parseProgress(file: string, markdown: string): Parsed<Progress> {
  const front = parseFrontmatter(markdown);
  if (!front)
    return { value: null, problems: [`${file}: missing frontmatter (--- task/status ---)`] };
  const problems: string[] = [];
  const taskId = front.data.task ?? "";
  const status = front.data.status ?? "";
  if (!(PROGRESS_STATUSES as readonly string[]).includes(status)) {
    problems.push(
      `${file}: status must be one of ${PROGRESS_STATUSES.join(", ")} (found "${status}")`,
    );
  }

  const sections = splitSections(front.body);
  const evidence = new Map<string, string>();
  for (const item of bullets(sections.get("acceptance evidence") ?? "")) {
    const match = /^(AC\d+):\s*(.*)$/.exec(item);
    if (match) evidence.set(match[1] ?? "", (match[2] ?? "").trim());
  }
  const dodSection = sections.get("definition of done");

  return {
    value: {
      file,
      taskId,
      status: status as ProgressStatus,
      log: sections.get("log") ?? "",
      evidence,
      dod: dodSection === undefined ? null : parseChecklist(dodSection),
    },
    problems,
  };
}

/** The checklist items in docs/definition-of-done.md. */
export function parseDefinitionOfDone(markdown: string): string[] {
  return parseChecklist(markdown).map((item) => item.text);
}

const normalizeItem = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** Problems that stop a task from being marked done. */
export function doneProblems(task: TaskSpec, progress: Progress, dodItems: string[]): string[] {
  const problems: string[] = [];
  for (const criterion of task.criteria) {
    if (!progress.evidence.get(criterion.id)) {
      problems.push(
        `${progress.file}: status is done but ${criterion.id} has no evidence under "## Acceptance evidence"`,
      );
    }
  }
  if (progress.dod === null) {
    problems.push(
      `${progress.file}: status is done but there is no "## Definition of Done" checklist`,
    );
    return problems;
  }
  for (const item of dodItems) {
    const match = progress.dod.find((entry) =>
      normalizeItem(entry.text).startsWith(normalizeItem(item)),
    );
    if (!match) problems.push(`${progress.file}: Definition of Done item missing: "${item}"`);
    else if (!match.checked)
      problems.push(`${progress.file}: Definition of Done item not ticked: "${item}"`);
  }
  return problems;
}

function markdownFiles(dir: string): string[] {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(".md"))
        .sort()
    : [];
}

export function loadWorkspace(root: string): { tasks: Task[]; problems: string[] } {
  const problems: string[] = [];
  const specs: TaskSpec[] = [];

  for (const name of markdownFiles(join(root, "tasks"))) {
    if (!TASK_FILE.test(name)) continue; // README.md, TEMPLATE.md
    const { value, problems: found } = parseSpec(
      `tasks/${name}`,
      readFileSync(join(root, "tasks", name), "utf8"),
    );
    problems.push(...found);
    if (value) specs.push(value);
  }

  const ids = new Map<string, string>();
  for (const spec of specs) {
    const existing = ids.get(spec.id);
    if (existing) problems.push(`${spec.file}: id ${spec.id} is also used by ${existing}`);
    ids.set(spec.id, spec.file);
  }

  const dodPath = join(root, "docs", "definition-of-done.md");
  const dodItems = existsSync(dodPath) ? parseDefinitionOfDone(readFileSync(dodPath, "utf8")) : [];
  if (dodItems.length === 0) problems.push("docs/definition-of-done.md: no checklist items found");

  const progressById = new Map<string, Progress>();
  for (const name of markdownFiles(join(root, "progress"))) {
    const file = `progress/${name}`;
    const { value, problems: found } = parseProgress(
      file,
      readFileSync(join(root, "progress", name), "utf8"),
    );
    problems.push(...found);
    if (!value) continue;
    const spec = specs.find((candidate) => candidate.id === value.taskId);
    if (!spec) {
      problems.push(`${file}: task "${value.taskId}" has no spec in tasks/`);
      continue;
    }
    if (name !== `${spec.id}-${spec.slug}.md`) {
      problems.push(
        `${file}: should be named progress/${spec.id}-${spec.slug}.md to match its spec`,
      );
    }
    if (value.status === "done") problems.push(...doneProblems(spec, value, dodItems));
    progressById.set(spec.id, value);
  }

  const tasks = specs.map((spec) => {
    const progress = progressById.get(spec.id) ?? null;
    return { spec, progress, status: progress?.status ?? ("todo" as const) };
  });
  return { tasks, problems };
}

export function taskIdFromBranch(branch: string | null): string | null {
  if (branch === null) return null;
  return TASK_BRANCH.exec(branch)?.[1] ?? null;
}

export function nextTaskId(tasks: Task[]): string {
  const highest = Math.max(0, ...tasks.map((task) => Number(task.spec.id)));
  return String(highest + 1).padStart(4, "0");
}
