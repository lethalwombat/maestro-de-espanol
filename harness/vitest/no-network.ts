// Unit tests are hermetic. Any fetch to a non-local host fails loudly instead of
// silently calling a real service (and spending money, in the case of Claude).
// Inject a fake instead: `fakeAnthropic()` from src/lib/llm/testing.ts for Claude,
// `vi.stubGlobal("fetch", ...)` for browser-side requests.
import { beforeEach } from "vitest";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const realFetch = globalThis.fetch;

function guardedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input, "http://localhost");
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Network access is blocked in unit tests (attempted ${url.origin}). ` +
        "Inject a fake client instead; see harness/vitest/no-network.ts.",
    );
  }
  return realFetch(input, init);
}

beforeEach(() => {
  globalThis.fetch = guardedFetch;
});
