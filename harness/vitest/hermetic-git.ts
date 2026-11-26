// Unit tests never touch the real repository. A push from a linked worktree runs
// the pre-push hook with an absolute GIT_DIR (and other GIT_* variables). Inherited
// by a test, they make git ignore the temp-dir cwd and rewrite the real .git.
// Deleting them from process.env here also keeps them out of every child process a
// test starts, such as git itself and the hook scripts in harness/hooks.
// Production code (harness/lib/git.ts, harness/cli/commit-msg.ts) keeps honouring
// GIT_* inside real hooks; only the test environment is cleaned.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("GIT_")) Reflect.deleteProperty(process.env, key);
}
