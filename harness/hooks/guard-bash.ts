// PreToolUse(Bash): blocks the git and shell operations that must never happen
// here (see harness/lib/policy.ts), and asks before commands that discard work.
// Inside a read-only subagent (the reviewer), only read-only commands pass.
import { homedir } from "node:os";
import { commonGitDir, currentBranch, realPath, worktreeRoot } from "../lib/git.ts";
import { emitPermission, projectDir, readHookInput, str, toolInput } from "../lib/hook-io.ts";
import { evaluateBash, evaluateReadOnlyBash, READ_ONLY_AGENTS } from "../lib/policy.ts";

const input = readHookInput();
const command = str(toolInput(input).command);

if (command !== undefined) {
  const agentType = str(input.agent_type);
  const readOnly = agentType !== undefined && READ_ONLY_AGENTS.has(agentType);
  const cwd = realPath(str(input.cwd) ?? projectDir(input));
  const inProject =
    commonGitDir(cwd) !== null && commonGitDir(cwd) === commonGitDir(projectDir(input));
  const verdict =
    (readOnly ? evaluateReadOnlyBash(command, worktreeRoot(cwd)) : null) ??
    evaluateBash(command, {
      cwd,
      root: inProject ? worktreeRoot(cwd) : null,
      branch: inProject ? currentBranch(cwd) : null,
      home: homedir(),
    });
  if (verdict) emitPermission(verdict);
}
