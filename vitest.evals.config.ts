// Human-owned (see docs/harness.md). Evals hit the real Claude API, so they are
// never part of `npm test`; run them with `npm run evals`.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    name: "evals",
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    testTimeout: 15 * 60_000,
    // One suite at a time keeps rate limits and the cost readout predictable.
    fileParallelism: false,
  },
});
