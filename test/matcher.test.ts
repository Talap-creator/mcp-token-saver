import { describe, it, expect } from "vitest";
import { extractTerms, scoreChunk, selectRelevant } from "../src/utils/matcher.js";
import { chunkFile } from "../src/utils/chunker.js";

describe("extractTerms", () => {
  it("drops stop words and short tokens", () => {
    expect(extractTerms("Fix the bug in login auth")).toEqual(["login", "auth"]);
  });

  it("dedupes", () => {
    expect(extractTerms("login login auth")).toEqual(["login", "auth"]);
  });
});

describe("scoreChunk", () => {
  it("gives big bonus when term matches symbol name", () => {
    const named = scoreChunk(
      { name: "login", text: "function login(){}", startLine: 1, endLine: 1 },
      ["login"],
    );
    const unnamed = scoreChunk(
      { name: null, text: "// nothing here", startLine: 1, endLine: 1 },
      ["login"],
    );
    expect(named).toBeGreaterThan(unnamed);
  });

  it("returns 1 for empty terms (keep everything)", () => {
    expect(
      scoreChunk(
        { name: null, text: "x", startLine: 1, endLine: 1 },
        [],
      ),
    ).toBe(1);
  });
});

describe("selectRelevant on JS file", () => {
  it("keeps the matching function and drops the others", () => {
    const src = `function login(user) { return user; }
function unrelated() { return 42; }
function logout() { return null; }`;
    const chunks = chunkFile("auth.js", src);
    const { kept, dropped } = selectRelevant(chunks, ["login"]);
    expect(kept.length).toBe(1);
    expect(kept[0].name).toBe("login");
    expect(dropped).toBeGreaterThan(0);
  });
});
