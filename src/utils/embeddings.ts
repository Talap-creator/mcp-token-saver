import type { Chunk } from "./chunker.js";
import type { ScoredChunk } from "./matcher.js";

const MODEL = process.env.MCP_TOKEN_SAVER_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2";

let extractorPromise: Promise<any> | null = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      return pipeline("feature-extraction", MODEL, { dtype: "fp32" });
    })();
  }
  return extractorPromise;
}

async function embed(texts: string[]): Promise<Float32Array[]> {
  const extractor = await getExtractor();
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  // out.data is a flat Float32Array of length texts.length * dim
  const dim = out.dims[out.dims.length - 1];
  const flat = out.data as Float32Array;
  const result: Float32Array[] = [];
  for (let i = 0; i < texts.length; i++) {
    result.push(flat.slice(i * dim, (i + 1) * dim));
  }
  return result;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // already normalized
}

export async function selectRelevantByEmbedding(
  query: string,
  chunks: Chunk[],
  threshold = 0.25,
): Promise<{ kept: ScoredChunk[]; dropped: number }> {
  if (chunks.length === 0) return { kept: [], dropped: 0 };
  const texts = chunks.map((c) => `${c.name ?? ""}\n${c.text}`.slice(0, 4000));
  const [queryVec, ...chunkVecs] = await embed([query, ...texts]);
  const scored: ScoredChunk[] = chunks.map((c, i) => ({
    ...c,
    score: cosine(queryVec, chunkVecs[i]),
  }));
  const kept = scored.filter((c) => c.score >= threshold);
  return { kept, dropped: scored.length - kept.length };
}
