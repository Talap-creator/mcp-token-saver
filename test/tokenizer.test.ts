import { describe, it, expect } from "vitest";
import { countTokens } from "../src/utils/tokenizer.js";

describe("countTokens", () => {
  it("returns 0 for empty string", () => {
    expect(countTokens("", "claude-opus-4-7")).toBe(0);
    expect(countTokens("", "gpt-4o")).toBe(0);
  });

  it("counts tokens for Claude via anthropic tokenizer", () => {
    const n = countTokens("hello world", "claude-opus-4-7");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(10);
  });

  it("counts tokens for GPT via tiktoken", () => {
    const n = countTokens("hello world", "gpt-4o");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(10);
  });

  it("scales with text length", () => {
    const short = countTokens("a", "claude-opus-4-7");
    const long = countTokens("a ".repeat(500), "claude-opus-4-7");
    expect(long).toBeGreaterThan(short * 50);
  });
});
