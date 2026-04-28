import { z } from "zod";
import { countTokens } from "../utils/tokenizer.js";
import { DEFAULT_MODEL, estimateCostUsd } from "../utils/cost.js";
import { addSpend } from "../utils/budget.js";

export const estimateTokensSchema = {
  prompt: z.string().describe("User prompt text"),
  files: z
    .array(z.string())
    .optional()
    .describe("File contents to include in the estimate"),
  model: z
    .string()
    .optional()
    .describe("Model name, e.g. claude-opus-4-7, gpt-4o"),
  commit: z
    .boolean()
    .optional()
    .describe("If true, charge the estimated cost against today's budget"),
};

const Input = z.object(estimateTokensSchema);

export async function estimateTokens(rawInput: unknown) {
  const { prompt, files = [], model = DEFAULT_MODEL, commit = false } =
    Input.parse(rawInput);

  const promptTokens = countTokens(prompt, model);
  const fileTokens = files.reduce((sum, f) => sum + countTokens(f, model), 0);
  const inputTokens = promptTokens + fileTokens;
  const estimatedOutput = Math.round(inputTokens * 0.8);
  const cost = estimateCostUsd(model, inputTokens, estimatedOutput);

  const warning =
    cost > 0.05 || inputTokens > 50_000 ? "high_usage" : "ok";

  if (commit) {
    await addSpend(cost);
  }

  const payload = {
    model,
    input_tokens: inputTokens,
    estimated_output_tokens: estimatedOutput,
    estimated_cost_usd: Number(cost.toFixed(6)),
    warning,
    committed: commit,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}
