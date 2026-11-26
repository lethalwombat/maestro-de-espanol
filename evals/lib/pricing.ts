// USD per million tokens, Claude API first-party rates as of 2026-11.
// Cost is always computed from recorded usage and the model that actually served
// the request. An unknown model reports null rather than a guessed rate.
interface Rates {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const RATES: Record<string, Rates> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export function costUsd(model: string, usage: Usage): number | null {
  const rates = RATES[model];
  if (!rates) return null;
  return (
    (usage.inputTokens * rates.input +
      usage.outputTokens * rates.output +
      usage.cacheWriteTokens * rates.cacheWrite +
      usage.cacheReadTokens * rates.cacheRead) /
    1_000_000
  );
}
