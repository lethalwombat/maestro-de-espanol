import { expect, test } from "@playwright/test";

test("the health endpoint reports ok and the build's commit", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  // The e2e build isn't a Docker image, so no commit is baked in.
  expect(await response.json()).toEqual({ status: "ok", commit: "unknown" });
});
