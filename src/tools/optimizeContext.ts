import { z } from "zod";
import { chunkFile } from "../utils/chunker.js";
import {
  extractTerms,
  selectRelevant,
  type ScoredChunk,
} from "../utils/matcher.js";
import { selectRelevantByEmbedding } from "../utils/embeddings.js";
import { countTokens } from "../utils/tokenizer.js";
import { DEFAULT_MODEL, estimateCostUsd } from "../utils/cost.js";

export const optimizeContextSchema = {
  query: z.string().describe("User query / task description"),
  files: z
    .array(
      z.object({
        path: z.string(),
        content: z.string(),
      }),
    )
    .describe("Files to filter for relevance"),
  model: z.string().optional(),
  mode: z
    .enum(["keyword", "embeddings"])
    .optional()
    .describe(
      "Selection strategy. 'keyword' (default) is fast, 'embeddings' uses a local MiniLM model (~25MB, cached after first run) for semantic matching.",
    ),
  threshold: z
    .number()
    .optional()
    .describe("Cosine similarity threshold for embeddings mode (default 0.25)"),
};

const Input = z.object(optimizeContextSchema);

export async function optimizeContext(rawInput: unknown) {
  const {
    query,
    files,
    model = DEFAULT_MODEL,
    mode = "keyword",
    threshold = 0.25,
  } = Input.parse(rawInput);

  const optimized: { path: string; content: string }[] = [];
  for (const file of files) {
    const chunks = chunkFile(file.path, file.content);
    let kept: ScoredChunk[];
    if (mode === "embeddings") {
      const r = await selectRelevantByEmbedding(query, chunks, threshold);
      kept = r.kept;
    } else {
      const terms = extractTerms(query);
      const r = selectRelevant(chunks, terms);
      kept = r.kept;
    }
    if (kept.length === 0) {
      optimized.push({
        path: file.path,
        content: "// [no relevant chunks found]",
      });
      continue;
    }
    kept.sort((a, b) => a.startLine - b.startLine);
    const pieces: string[] = [];
    let prevEnd = 0;
    for (const c of kept) {
      if (c.startLine - prevEnd > 1 && prevEnd > 0) {
        pieces.push("// ... [trimmed]");
      }
      pieces.push(c.text);
      prevEnd = c.endLine;
    }
    optimized.push({ path: file.path, content: pieces.join("\n") });
  }

  const originalTokens = files.reduce(
    (s, f) => s + countTokens(f.content, model),
    0,
  );
  const newTokens = optimized.reduce(
    (s, f) => s + countTokens(f.content, model),
    0,
  );
  const reduction =
    originalTokens === 0
      ? 0
      : Math.max(
          0,
          Math.round(((originalTokens - newTokens) / originalTokens) * 100),
        );
  const savedDelta = Math.max(0, originalTokens - newTokens);
  const savedCost = estimateCostUsd(model, savedDelta, savedDelta * 0.8);

  const payload = {
    mode,
    optimized_files: optimized,
    reduction_percent: reduction,
    original_tokens: originalTokens,
    optimized_tokens: newTokens,
    message: `Context reduced by ${reduction}% (${mode}). ~$${savedCost.toFixed(4)} saved.`,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}
