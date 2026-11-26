import { describe, expect, it } from "vitest";
import { isWriteRedirect, parseCommandLine, stripHeredocs } from "./shell.ts";

const argvs = (command: string) => parseCommandLine(command).map((cmd) => cmd.argv);

describe("parseCommandLine", () => {
  it.each([
    ["git status", [["git", "status"]]],
    [
      "npm test && git push origin main",
      [
        ["npm", "test"],
        ["git", "push", "origin", "main"],
      ],
    ],
    ["a || b; c | d & e", [["a"], ["b"], ["c"], ["d"], ["e"]]],
    ["echo 'single quoted; not split'", [["echo", "single quoted; not split"]]],
    ['echo "double \\"quoted\\" && still one"', [["echo", 'double "quoted" && still one']]],
    ["FOO=1 BAR=2 git commit -m x", [["git", "commit", "-m", "x"]]],
    ["timeout 30 npm test", [["npm", "test"]]],
    ["env -i PATH=/bin git push", [["git", "push"]]],
    ["sudo -u root rm -rf /", [["rm", "-rf", "/"]]],
    ["nohup time nice -n 5 make", [["make"]]],
    [
      "(cd sub && git push --force)",
      [
        ["cd", "sub"],
        ["git", "push", "--force"],
      ],
    ],
    [
      "for f in a b; do rm -rf $f; done",
      [
        ["for", "f", "in", "a", "b"],
        ["rm", "-rf", "$f"],
      ],
    ],
    ["if true; then git push; fi", [["true"], ["git", "push"]]],
    ["echo hi # git push --force", [["echo", "hi"]]],
  ])("splits %j into simple commands", (command, expected) => {
    expect(argvs(command)).toEqual(expected);
  });

  it("parses commands inside $(...), backticks and process substitution", () => {
    expect(argvs('echo "$(git push -f)" `rm -rf .git` <(cat x)')).toEqual([
      ["git", "push", "-f"],
      ["rm", "-rf", ".git"],
      ["cat", "x"],
      ["echo", "$(…)", "`…`", "$(…)"],
    ]);
  });

  it("parses the script given to bash -c and friends", () => {
    expect(argvs("bash -c 'git push --force origin x'")).toContainEqual([
      "git",
      "push",
      "--force",
      "origin",
      "x",
    ]);
    expect(argvs('sh -lc "rm -rf /"')).toContainEqual(["rm", "-rf", "/"]);
    expect(argvs("eval git push -f")).toContainEqual(["git", "push", "-f"]);
  });

  it("records redirect targets and ignores descriptor duplication", () => {
    const [cmd] = parseCommandLine("npm test > out.log 2>&1 >> more.log 2>/dev/null &> all.log");

    expect(cmd?.argv).toEqual(["npm", "test"]);
    expect(cmd?.redirects).toEqual([
      { op: ">", target: "out.log" },
      { op: ">>", target: "more.log" },
      { op: ">", target: "/dev/null" },
      { op: "&>", target: "all.log" },
    ]);
    expect(cmd?.redirects.filter(isWriteRedirect).map((redirect) => redirect.target)).toEqual([
      "out.log",
      "more.log",
      "all.log",
    ]);
  });

  it("treats input redirects and here-strings as reads", () => {
    const [cmd] = parseCommandLine("grep x < input.txt <<< 'text'");

    expect(cmd?.redirects.some(isWriteRedirect)).toBe(false);
  });

  it("ignores heredoc bodies, including the common commit-message form", () => {
    const command = [
      "git commit -m \"$(cat <<'EOF'",
      "feat: it's got (unbalanced parens and quotes",
      "git push --force",
      "EOF",
      ')"',
    ].join("\n");

    expect(argvs(command)).toEqual([["cat"], ["git", "commit", "-m", "$(…)"]]);
  });
});

describe("stripHeredocs", () => {
  it("handles <<- with tab-indented delimiters and several heredocs", () => {
    const input = "cat <<-A <<B\n\tbody a\n\tA\nbody b\nB\necho done";

    expect(stripHeredocs(input)).toBe("cat <<-A <<B\necho done");
  });
});
