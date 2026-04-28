import type { Chunk } from "./chunker.js";

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been","being",
  "to","of","in","on","at","for","with","by","from","as","that","this","it",
  "fix","bug","error","issue","please","help","find","make","do","i","we","you",
  "how","what","why","where","when","which","who","whom",
]);

export function extractTerms(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  return Array.from(new Set(tokens));
}

export interface ScoredChunk extends Chunk {
  score: number;
}

export function scoreChunk(chunk: Chunk, terms: string[]): number {
  if (terms.length === 0) return 1;
  const body = chunk.text.toLowerCase();
  const name = (chunk.name ?? "").toLowerCase();
  let score = 0;
  for (const t of terms) {
    const bodyHits = countOccurrences(body, t);
    score += bodyHits;
    if (name.includes(t)) score += 5;
  }
  return score;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export function selectRelevant(
  chunks: Chunk[],
  terms: string[],
): { kept: ScoredChunk[]; dropped: number } {
  const scored = chunks.map((c) => ({ ...c, score: scoreChunk(c, terms) }));
  const kept = scored.filter((c) => c.score > 0);
  return { kept, dropped: scored.length - kept.length };
}
