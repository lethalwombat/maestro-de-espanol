import { afterEach, describe, expect, it, vi } from "vitest";
import { handleHealthRequest } from "./handler";

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports ok and the commit the image was built from, without calling Claude", async () => {
    vi.stubEnv("APP_COMMIT_SHA", "0123456789abcdef0123456789abcdef01234567");
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);

    const response = handleHealthRequest();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      commit: "0123456789abcdef0123456789abcdef01234567",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports the commit as unknown outside a built image", async () => {
    vi.stubEnv("APP_COMMIT_SHA", undefined);

    const response = handleHealthRequest();

    expect(await response.json()).toEqual({ status: "ok", commit: "unknown" });
  });
});
