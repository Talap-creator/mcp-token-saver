import { parse } from "@babel/parser";

export interface Chunk {
  name: string | null;
  text: string;
  startLine: number;
  endLine: number;
}

const JS_TS_EXT = /\.(js|jsx|ts|tsx|mjs|cjs)$/i;

export function chunkFile(path: string, content: string): Chunk[] {
  if (JS_TS_EXT.test(path)) {
    const ast = tryParseJs(content);
    if (ast) return chunkJs(content, ast);
  }
  return chunkByBlankLines(content);
}

function tryParseJs(src: string) {
  try {
    return parse(src, {
      sourceType: "unambiguous",
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
      errorRecovery: true,
      plugins: ["typescript", "jsx", "decorators-legacy", "classProperties"],
    });
  } catch {
    return null;
  }
}

function chunkJs(content: string, ast: ReturnType<typeof parse>): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  for (const node of ast.program.body) {
    const startLine = node.loc?.start.line ?? 1;
    const endLine = node.loc?.end.line ?? startLine;
    const name = extractName(node);
    const text = lines.slice(startLine - 1, endLine).join("\n");
    chunks.push({ name, text, startLine, endLine });
  }
  if (chunks.length === 0) return chunkByBlankLines(content);
  return chunks;
}

function extractName(node: any): string | null {
  if (!node) return null;
  if (node.id?.name) return node.id.name;
  if (node.declaration?.id?.name) return node.declaration.id.name;
  if (node.declarations?.[0]?.id?.name) return node.declarations[0].id.name;
  if (node.key?.name) return node.key.name;
  return null;
}

function chunkByBlankLines(content: string): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  let buf: string[] = [];
  let start = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" && buf.length > 0) {
      chunks.push({
        name: guessName(buf),
        text: buf.join("\n"),
        startLine: start,
        endLine: i,
      });
      buf = [];
      start = i + 2;
    } else if (line.trim() !== "") {
      if (buf.length === 0) start = i + 1;
      buf.push(line);
    }
  }
  if (buf.length) {
    chunks.push({
      name: guessName(buf),
      text: buf.join("\n"),
      startLine: start,
      endLine: lines.length,
    });
  }
  return chunks;
}

function guessName(lines: string[]): string | null {
  const head = lines[0] ?? "";
  const m = head.match(
    /\b(?:function|class|def|interface|type|const|let|var)\s+([A-Za-z_][\w$]*)/,
  );
  return m?.[1] ?? null;
}
