import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

/**
 * Process-wide Claude client, created on first use. Credentials come from the
 * environment (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login`
 * profile); ANTHROPIC_BASE_URL redirects it, which the e2e mock server relies on.
 * Server-side only: never import this from a client component.
 */
export function getAnthropicClient(): Anthropic {
  client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 });
  return client;
}
