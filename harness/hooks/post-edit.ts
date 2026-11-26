// PostToolUse(Edit|Write|MultiEdit): formats the file with Prettier, then lints
// it. Lint errors go straight back to Claude next to the tool result, so they
// get fixed while the change is fresh rather than at the end of the turn.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { commonGitDir, realPath, worktreeRoot } from "../lib/git.ts";
import { projectDir, readHookInput, str, toolInput } from "../lib/hook-io.ts";

const PRETTIER = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".yml",
  ".yaml",
]);
const ESLINT = new Set([".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs"]);

const input = readHookInput();
const filePath = str(toolInput(input).file_path);
const absolute =
  filePath === undefined ? undefined : realPath(resolve(str(input.cwd) ?? process.cwd(), filePath));
const root =
  absolute === undefined || !existsSync(absolute) ? null : worktreeRoot(join(absolute, ".."));

if (
  absolute !== undefined &&
  root !== null &&
  commonGitDir(root) === commonGitDir(projectDir(input))
) {
  const rel = relative(root, absolute);
  const bin = (name: string) => join(root, "node_modules", ".bin", name);
  const ext = extname(absolute);
  const problems: string[] = [];

  if (!rel.startsWith("node_modules") && !rel.startsWith(".next")) {
    if (PRETTIER.has(ext) && existsSync(bin("prettier"))) {
      const result = spawnSync(bin("prettier"), ["--write", "--log-level=warn", absolute], {
        cwd: root,
        encoding: "utf8",
      });
      if (result.status !== 0)
        problems.push(`Prettier could not format ${rel}:\n${result.stderr.trim()}`);
    }
    if (ESLINT.has(ext) && existsSync(bin("eslint"))) {
      const result = spawnSync(bin("eslint"), ["--max-warnings=0", "--no-warn-ignored", absolute], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
      });
      if (result.status !== 0)
        problems.push(
          `ESLint found problems in ${rel}:\n${result.stdout.trim() || result.stderr.trim()}`,
        );
    }
  }

  if (problems.length > 0) {
    process.stdout.write(JSON.stringify({ decision: "block", reason: problems.join("\n\n") }));
  }
}
