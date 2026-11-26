// Human-owned quality gate (see docs/harness.md). Coverage thresholds live here
// on purpose: lowering them is a decision for a person, not a way to get green.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "harness/**/*.test.ts", "evals/**/*.test.ts"],
          setupFiles: ["./harness/vitest/no-network.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./harness/vitest/no-network.ts", "./harness/vitest/dom.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "harness/lib/**/*.ts", "evals/lib/**/*.ts"],
      // Next.js route files are thin wrappers exercised by e2e tests.
      exclude: ["**/*.test.{ts,tsx}", "src/app/**"],
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 80 },
    },
  },
});
