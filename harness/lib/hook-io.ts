import { readFileSync } from "node:fs";
import type { Verdict } from "./policy.ts";

export type HookInput = Record<string, unknown>;

/** The JSON Claude Code sends on stdin. */
export function readHookInput(): HookInput {
  const raw = readFileSync(0, "utf8");
  return raw.trim() === "" ? {} : (JSON.parse(raw) as HookInput);
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function toolInput(input: HookInput): Record<string, unknown> {
  const value = input.tool_input;
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** The project root Claude Code was started in. Stays fixed when Claude enters a worktree. */
export function projectDir(input: HookInput): string {
  return process.env.CLAUDE_PROJECT_DIR ?? str(input.cwd) ?? process.cwd();
}

export function emitPermission(verdict: Verdict): void {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: verdict.decision,
        permissionDecisionReason: verdict.reason,
      },
    }),
  );
}
