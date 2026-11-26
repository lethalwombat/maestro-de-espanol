// UserPromptSubmit: remembers the worktree state at the start of each turn, so
// the Stop gate only runs when Claude actually changed something. Prints
// nothing: stdout from this event would be added to Claude's context.
import { treeFingerprint, worktreeRoot } from "../lib/git.ts";
import { updateSession } from "../lib/gate-state.ts";
import { projectDir, readHookInput, str } from "../lib/hook-io.ts";

const input = readHookInput();
const root = worktreeRoot(str(input.cwd) ?? projectDir(input));
const sessionId = str(input.session_id);
if (root !== null && sessionId !== undefined) {
  updateSession(root, sessionId, { turnStart: treeFingerprint(root) });
}
