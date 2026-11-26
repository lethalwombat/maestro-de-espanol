// Human-owned quality gate (see docs/harness.md).
// e2e runs against a production build. Claude is replaced by a local mock server
// (e2e/mock-anthropic.ts) via ANTHROPIC_BASE_URL, so the real SDK code path runs
// and no test ever reaches the network.
import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3100;
const MOCK_PORT = 4010;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: isCI ? 1 : 0,
  // A test that only passes on retry still fails the run.
  failOnFlakyTests: true,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/mock-anthropic.ts",
      url: `http://127.0.0.1:${MOCK_PORT}/health`,
      env: { MOCK_ANTHROPIC_PORT: String(MOCK_PORT) },
      reuseExistingServer: false,
    },
    {
      command: `npm run build && npx next start --port ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}`,
      env: {
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        ANTHROPIC_API_KEY: "e2e-placeholder-key",
      },
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
});
