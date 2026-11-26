import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// A push from a linked worktree runs the tests with an absolute GIT_DIR. Any git
// a test starts would then ignore its temp-dir cwd and rewrite the real repo.
describe("hermetic git", () => {
  it("leaves no GIT_* variable in process.env", () => {
    expect(Object.keys(process.env).filter((key) => key.startsWith("GIT_"))).toEqual([]);
  });

  it("leaves no GIT_* variable in a child process's environment", () => {
    const childEnv = execFileSync(
      process.execPath,
      ["-e", "console.log(JSON.stringify(process.env))"],
      {
        encoding: "utf8",
      },
    );
    const keys = Object.keys(JSON.parse(childEnv) as Record<string, string>);
    expect(keys.filter((key) => key.startsWith("GIT_"))).toEqual([]);
  });
});
