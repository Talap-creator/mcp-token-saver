// Prices in USD per 1M tokens. Update as providers change pricing.
export interface ModelPricing {
  input: number;
  output: number;
}

export const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export const DEFAULT_MODEL = "claude-opus-4-7";

export function pricingFor(model: string): ModelPricing {
  return PRICING[model] ?? PRICING[DEFAULT_MODEL];
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = pricingFor(model);
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
