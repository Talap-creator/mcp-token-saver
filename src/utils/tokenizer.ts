import { countTokens as anthropicCount } from "@anthropic-ai/tokenizer";
import { encoding_for_model, get_encoding, type TiktokenModel } from "tiktoken";

const tiktokenCache = new Map<string, ReturnType<typeof get_encoding>>();

function tiktokenEncoderFor(model: string) {
  const key = model;
  const cached = tiktokenCache.get(key);
  if (cached) return cached;
  let enc;
  try {
    enc = encoding_for_model(model as TiktokenModel);
  } catch {
    enc = get_encoding("cl100k_base");
  }
  tiktokenCache.set(key, enc);
  return enc;
}

export function countTokens(text: string, model: string): number {
  if (!text) return 0;
  if (/claude/i.test(model)) {
    return anthropicCount(text);
  }
  return tiktokenEncoderFor(model).encode(text).length;
}
