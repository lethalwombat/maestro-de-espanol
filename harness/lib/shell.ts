// A best-effort shell parser for policy checks. It is not a security boundary
// (use the sandbox for that); it exists so guard rules see the commands an agent
// actually runs, including ones chained with &&, piped, nested in $(...) or
// `bash -c`, or prefixed with env assignments and wrappers.

export interface Redirect {
  op: string;
  target: string;
}

export interface SimpleCommand {
  argv: string[];
  redirects: Redirect[];
}

const SEPARATORS = new Set([";", "\n", "&", "|", "(", ")"]);
const KEYWORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "do",
  "done",
  "while",
  "until",
  "!",
  "{",
  "}",
]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const MAX_DEPTH = 6;

/** Removes heredoc bodies, which are data, not commands. */
export function stripHeredocs(input: string): string {
  const out: string[] = [];
  const pending: Array<{ delimiter: string; stripTabs: boolean }> = [];
  const start = /(?<!<)<<(?!<)(-?)\s*(['"]?)([A-Za-z_][\w.-]*)\2/g;
  for (const line of input.split("\n")) {
    const current = pending[0];
    if (current) {
      const candidate = current.stripTabs ? line.replace(/^\t+/, "") : line;
      if (candidate.trim() === current.delimiter) pending.shift();
      continue;
    }
    out.push(line);
    for (const match of line.matchAll(start)) {
      pending.push({ delimiter: match[3] ?? "", stripTabs: match[1] === "-" });
    }
  }
  return out.join("\n");
}

/** Returns the index just past the `)` that closes a `$(` or `<(` opened before `from`. */
function closingParen(src: string, from: number): number {
  let depth = 1;
  let i = from;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return src.length + 1;
}

function stripWrappers(argv: string[]): string[] {
  let args = argv;
  for (;;) {
    while (
      args.length > 0 &&
      (KEYWORDS.has(args[0] ?? "") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0] ?? ""))
    ) {
      args = args.slice(1);
    }
    const [head, ...rest] = args;
    if (head === undefined) return args;
    const name = head.split("/").pop();
    if (
      name === "time" ||
      name === "nohup" ||
      name === "command" ||
      name === "builtin" ||
      name === "noglob" ||
      name === "exec"
    ) {
      args = rest;
    } else if (
      name === "sudo" ||
      name === "env" ||
      name === "nice" ||
      name === "stdbuf" ||
      name === "xargs"
    ) {
      // Drop the wrapper's own options (and simple option values) before the real command.
      let i = 0;
      while (
        i < rest.length &&
        (rest[i]?.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[i] ?? ""))
      ) {
        i += rest[i] === "-n" || rest[i] === "-u" ? 2 : 1;
      }
      args = rest.slice(i);
    } else if (name === "timeout") {
      let i = 0;
      while (i < rest.length && rest[i]?.startsWith("-")) i++;
      args = rest.slice(i + 1);
    } else {
      return args;
    }
  }
}

function parseInto(src: string, out: SimpleCommand[], depth: number): void {
  if (depth > MAX_DEPTH) return;

  let argv: string[] = [];
  let redirects: Redirect[] = [];
  let word = "";
  let inWord = false;
  let pendingRedirect: string | null = null;

  const pushWord = () => {
    if (!inWord) return;
    if (pendingRedirect !== null) {
      redirects.push({ op: pendingRedirect, target: word });
      pendingRedirect = null;
    } else {
      argv.push(word);
    }
    word = "";
    inWord = false;
  };

  const endCommand = () => {
    pushWord();
    const stripped = stripWrappers(argv);
    if (stripped.length > 0 || redirects.length > 0) {
      out.push({ argv: stripped, redirects });
      const [program, ...rest] = stripped;
      const shell = program?.split("/").pop();
      if (shell !== undefined && SHELLS.has(shell)) {
        const flagIndex = rest.findIndex((arg) => /^-[a-z]*c[a-z]*$/.test(arg));
        const script = flagIndex === -1 ? undefined : rest[flagIndex + 1];
        if (script !== undefined) parseInto(stripHeredocs(script), out, depth + 1);
      }
      if (shell === "eval") parseInto(rest.join(" "), out, depth + 1);
    }
    argv = [];
    redirects = [];
    pendingRedirect = null;
  };

  const substitute = (start: number): number => {
    const end = closingParen(src, start);
    parseInto(src.slice(start, end - 1), out, depth + 1);
    word += "$(…)";
    inWord = true;
    return end;
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? "";
    const next = src[i + 1];

    if (c === "\\") {
      if (next !== undefined && next !== "\n") {
        word += next;
        inWord = true;
      }
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      const stop = end === -1 ? src.length : end;
      word += src.slice(i + 1, stop);
      inWord = true;
      i = stop + 1;
      continue;
    }
    if (c === '"') {
      inWord = true;
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < src.length) {
          word += src[i + 1] ?? "";
          i += 2;
        } else if (src[i] === "$" && src[i + 1] === "(") {
          i = substitute(i + 2);
        } else if (src[i] === "`") {
          const end = src.indexOf("`", i + 1);
          const stop = end === -1 ? src.length : end;
          parseInto(src.slice(i + 1, stop), out, depth + 1);
          word += "`…`";
          i = stop + 1;
        } else {
          word += src[i] ?? "";
          i++;
        }
      }
      i++;
      continue;
    }
    if ((c === "$" || c === "<" || c === ">") && next === "(") {
      i = substitute(i + 2);
      continue;
    }
    if (c === "`") {
      const end = src.indexOf("`", i + 1);
      const stop = end === -1 ? src.length : end;
      parseInto(src.slice(i + 1, stop), out, depth + 1);
      word += "`…`";
      inWord = true;
      i = stop + 1;
      continue;
    }
    if (c === "#" && !inWord) {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "&" && next === ">") {
      pushWord();
      const append = src[i + 2] === ">";
      pendingRedirect = append ? "&>>" : "&>";
      i += append ? 3 : 2;
      continue;
    }
    if (c === ">" || c === "<") {
      // A bare fd number right before the operator (2>file) belongs to the redirect.
      if (inWord && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      }
      pushWord();
      let op = c;
      let j = i + 1;
      while (
        j < src.length &&
        (src[j] === ">" || src[j] === "<" || src[j] === "|" || src[j] === "&")
      ) {
        op += src[j] ?? "";
        j++;
      }
      // Duplicating a descriptor (2>&1) has no file target.
      if (op.endsWith("&") && /^[\d-]/.test(src[j] ?? "")) {
        while (j < src.length && /[\d-]/.test(src[j] ?? "")) j++;
        i = j;
        continue;
      }
      pendingRedirect = op.replace(/&$/, "");
      i = j;
      continue;
    }
    if (SEPARATORS.has(c)) {
      endCommand();
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      pushWord();
      i++;
      continue;
    }
    word += c;
    inWord = true;
    i++;
  }
  endCommand();
}

/** Every simple command in `input`, including nested ones, in source order. */
export function parseCommandLine(input: string): SimpleCommand[] {
  const out: SimpleCommand[] = [];
  parseInto(stripHeredocs(input), out, 0);
  return out;
}

/** True for redirects that write to their target. */
export function isWriteRedirect(redirect: Redirect): boolean {
  return redirect.op.includes(">") && redirect.target !== "/dev/null";
}
