// PreToolUse(Edit|Write|MultiEdit|NotebookEdit): blocks edits to human-owned
// harness files and any edit while on main. Only this project's repository (and
// its worktrees) is policed; files elsewhere pass through untouched.
import { dirname, relative, resolve } from "node:path";
import {
  commonGitDir,
  currentBranch,
  nearestExistingDir,
  realPath,
  worktreeRoot,
} from "../lib/git.ts";
import { emitPermission, projectDir, readHookInput, str, toolInput } from "../lib/hook-io.ts";
import { evaluateEdit } from "../lib/policy.ts";

const input = readHookInput();
const args = toolInput(input);
const filePath = str(args.file_path) ?? str(args.notebook_path);

if (filePath !== undefined) {
  const absolute = realPath(resolve(str(input.cwd) ?? process.cwd(), filePath));
  const dir = nearestExistingDir(dirname(absolute));
  const root = worktreeRoot(dir);
  const sameRepo = root !== null && commonGitDir(dir) === commonGitDir(projectDir(input));
  if (root !== null && sameRepo) {
    const verdict = evaluateEdit({
      relPath: relative(root, absolute),
      branch: currentBranch(root),
    });
    if (verdict) emitPermission(verdict);
  }
}
