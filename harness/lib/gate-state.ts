// Small persistent state for the Stop gate. It lives inside the worktree's git
// directory (.git/claude-harness, or .git/worktrees/<name>/claude-harness), so
// writing it never changes the worktree fingerprint it records, and it is never
// committed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gitPath } from "./git.ts";

export interface SessionState {
  /** Fingerprint when the user last sent a prompt. */
  turnStart?: string;
  /** Fingerprint the last time the Stop gate blocked. */
  lastFailed?: string;
}

function stateDir(root: string): string {
  return gitPath(root, "claude-harness") ?? join(root, ".git", "claude-harness");
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

const sessionFile = (root: string, sessionId: string) =>
  join(stateDir(root), "sessions", `${sessionId.replace(/[^\w-]/g, "_")}.json`);

export function readSession(root: string, sessionId: string): SessionState {
  return readJson<SessionState>(sessionFile(root, sessionId), {});
}

export function updateSession(root: string, sessionId: string, patch: SessionState): void {
  writeJson(sessionFile(root, sessionId), { ...readSession(root, sessionId), ...patch });
}

/** Fingerprint of the last worktree state that passed `npm run check`. */
export function readLastGreen(root: string): string | undefined {
  return readJson<{ fingerprint?: string }>(join(stateDir(root), "last-green.json"), {})
    .fingerprint;
}

export function writeLastGreen(root: string, fingerprint: string): void {
  writeJson(join(stateDir(root), "last-green.json"), { fingerprint });
}
