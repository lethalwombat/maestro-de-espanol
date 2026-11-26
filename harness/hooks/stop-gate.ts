// Stop: Claude can't end a turn in which it changed the worktree until
// `npm run check` passes. Exit code 2 sends Claude back to work with the
// failures on stderr.
//
// It stays out of the way when it has nothing to say:
// - nothing changed since the user's prompt (a question, a read-only turn)
// - this exact worktree state already passed
// - Claude was already sent back once and changed nothing since: blocking again
//   would loop, so the turn ends with a warning to the user instead
//
// Usage: node harness/hooks/stop-gate.ts [check command...]  (default: node harness/cli/check.ts)
import { spawnSync } from "node:child_process";
import { readLastGreen, readSession, updateSession, writeLastGreen } from "../lib/gate-state.ts";
import { treeFingerprint, worktreeRoot } from "../lib/git.ts";
import { projectDir, readHookInput, str } from "../lib/hook-io.ts";

const input = readHookInput();
const root = worktreeRoot(str(input.cwd) ?? projectDir(input));
const sessionId = str(input.session_id) ?? "unknown";

if (root !== null) {
  const fingerprint = treeFingerprint(root);
  const session = readSession(root, sessionId);

  if (session.turnStart === fingerprint || readLastGreen(root) === fingerprint) {
    process.exit(0);
  }

  if (input.stop_hook_active === true && session.lastFailed === fingerprint) {
    process.stdout.write(
      JSON.stringify({
        systemMessage:
          "Stop gate: `npm run check` still fails and Claude made no further changes. " +
          "Treat this turn's work as unverified; run `npm run check` to see the failures.",
      }),
    );
    process.exit(0);
  }

  const [command = "node", ...args] =
    process.argv.length > 2 ? process.argv.slice(2) : ["node", "harness/cli/check.ts"];
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.status === 0) {
    writeLastGreen(root, fingerprint);
    process.exit(0);
  }

  updateSession(root, sessionId, { lastFailed: fingerprint });
  const output = `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-150).join("\n");
  process.stderr.write(
    "Stop gate: `npm run check` failed, so this turn isn't done yet. Fix the causes below.\n" +
      "Don't skip, delete or loosen tests, lint rules or thresholds. If you can't fix a failure, " +
      "explain what's failing and why to the user.\n\n" +
      output +
      "\n",
  );
  process.exit(2);
}
