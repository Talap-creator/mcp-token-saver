# mcp-token-saver

> Local MCP server that teaches AI coding assistants to be cheap. Estimates token cost **before** the call, strips irrelevant code from large contexts, and tracks daily spend — all without leaving your machine.

[![npm version](https://img.shields.io/npm/v/mcp-token-saver.svg)](https://www.npmjs.com/package/mcp-token-saver)
[![npm downloads](https://img.shields.io/npm/dm/mcp-token-saver.svg)](https://www.npmjs.com/package/mcp-token-saver)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org)

---

## Why

LLM coding tools (Claude Code, Cursor, Codex CLI, Continue) burn tokens silently. A single "fix this bug" with a 3000-line file attached can cost $0.10+. Multiply by a workday and you've spent more on context than on actual answers.

`mcp-token-saver` is the layer between your prompt and the model:

1. **`estimate_tokens`** — predicts token count and USD cost of your request **before** it's sent.
2. **`optimize_context`** — keeps only the chunks of code relevant to the query (keyword or local-embedding match), discarding the rest.
3. **`check_budget`** — tracks daily spend in a local JSON file and warns when you're close to the limit.

Combined with an explicit instruction in your `CLAUDE.md`, the model is forced to call these tools on every task — and the savings get reported back to you in plain English ("Context reduced by 65%. ~$0.014 saved.").

---

## Table of contents

- [Features](#features)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Tools API](#tools-api)
- [Activating the protocol](#activating-the-protocol)
- [Architecture](#architecture)
- [Development](#development)
- [FAQ](#faq)
- [License](#license)

---

## Features

- **Multi-provider tokenizers.** Claude (`@anthropic-ai/tokenizer`) and OpenAI (`tiktoken`) are auto-routed by model name.
- **Two optimization modes.** `keyword` (fast regex + Babel AST scoring) and `embeddings` (local `Xenova/all-MiniLM-L6-v2`, ~25MB, cached after first run, **no network calls**).
- **Daily budget.** Tracks spend per day in `~/.mcp-token-saver/state.json` with file-locking. Configurable USD limit.
- **Babel-aware chunking.** JS/TS files are split by function/class/declaration. Other languages fall back to blank-line blocks with regex name guessing.
- **Zero-config Claude Code integration.** Drop a path in `.mcp.json` and a paragraph in `CLAUDE.md`.
- **Local-only.** No telemetry, no API keys, no remote services.

---

## How it works

```
┌──────────────────┐   "fix bug in auth.ts"     ┌──────────────────┐
│  Claude Code     │  ──────────────────────▶   │ mcp-token-saver  │
│  (or any MCP     │                             │  (stdio server)  │
│   client)        │  ◀──────────────────────   │                  │
└──────────────────┘   { input_tokens: 4200,    └──────────────────┘
        │              estimated_cost: $0.063,           │
        │              warning: "high_usage" }           │
        │                                                │
        │   if input_tokens > 1500 →                    │
        │   call optimize_context  ──────────────────▶  │
        │                                                │
        │   ◀── { reduction_percent: 71,                │
        │       message: "Context reduced by 71%" }     │
        │                                                │
        ▼                                                ▼
   answer using                                    update budget
   optimized_files                                ~/.mcp-token-saver/
```

The `CLAUDE.md` you ship with your project tells the model **when** to call each tool. Without that policy file, models tend to skip optional helpers — the explicit `MUST` language in [`src/prompts/system.md`](src/prompts/system.md) is what makes the protocol stick.

---

## Quick start

### 1. Add to Claude Code (one line, no install)

In your project's `.mcp.json` (or `~/.claude/settings.json` for global):

```json
{
  "mcpServers": {
    "token-saver": {
      "command": "npx",
      "args": ["-y", "mcp-token-saver"]
    }
  }
}
```

That's it — `npx` fetches and runs the latest version on demand.

### 2. Or clone and run locally

```bash
git clone https://github.com/Talap-creator/mcp-token-saver.git
cd mcp-token-saver
npm install && npm run build
```
Then point `.mcp.json` at `dist/index.js`:
```json
{"mcpServers":{"token-saver":{"command":"node","args":["C:/path/to/mcp-token-saver/dist/index.js"]}}}
```

### 3. Activate the protocol

Copy [`src/prompts/system.md`](src/prompts/system.md) into your project's `CLAUDE.md`. Without this step the model sees the tools but is not told to use them.

### 4. Restart Claude Code

That's it. On the next prompt with attached files the model will call `estimate_tokens` first and report back what it found.

---

## Configuration

| Env var | Default | Description |
|---|---|---|
| `MCP_TOKEN_SAVER_DAILY_LIMIT` | `5` | Daily USD limit. |
| `MCP_TOKEN_SAVER_STATE` | `~/.mcp-token-saver/state.json` | Override state file path. |
| `MCP_TOKEN_SAVER_EMBED_MODEL` | `Xenova/all-MiniLM-L6-v2` | HuggingFace model for embeddings mode. |

State file format:
```json
{
  "daily_limit_usd": 5,
  "days": { "2026-04-28": 1.84 }
}
```

---

## Tools API

### `estimate_tokens`

Predict token count and cost of a prompt + optional files.

**Input**
| Field | Type | Description |
|---|---|---|
| `prompt` | `string` | Required. The user prompt. |
| `files` | `string[]` | Optional. File contents to include. |
| `model` | `string` | Default `claude-opus-4-7`. Used for tokenizer routing and pricing. |
| `commit` | `boolean` | If `true`, charges the estimated cost against today's budget. |

**Output**
```json
{
  "model": "claude-opus-4-7",
  "input_tokens": 4203,
  "estimated_output_tokens": 3362,
  "estimated_cost_usd": 0.315,
  "warning": "high_usage",
  "committed": false
}
```

### `optimize_context`

Reduce context size by selecting only chunks relevant to the query.

**Input**
| Field | Type | Description |
|---|---|---|
| `query` | `string` | The task or question. |
| `files` | `{ path, content }[]` | Files to filter. |
| `model` | `string` | Optional. For pricing display only. |
| `mode` | `"keyword" \| "embeddings"` | Default `keyword`. |
| `threshold` | `number` | Cosine threshold for embeddings mode (default `0.25`). |

**Output**
```json
{
  "mode": "keyword",
  "optimized_files": [{ "path": "auth.ts", "content": "function login(){...}" }],
  "reduction_percent": 71,
  "original_tokens": 4203,
  "optimized_tokens": 1219,
  "message": "Context reduced by 71% (keyword). ~$0.0312 saved."
}
```

### `check_budget`

Returns today's remaining USD.

**Output**
```json
{
  "daily_limit_usd": 5,
  "spent_today_usd": 1.84,
  "remaining_budget_usd": 3.16,
  "warning": "ok"
}
```

`warning` is `low_budget` when <20% remains, `exceeded` when ≤0.

---

## Activating the protocol

Models will not call optional tools without an explicit policy. Paste this into your project's `CLAUDE.md`:

```markdown
You have access to the `mcp-token-saver` MCP server. You MUST follow this protocol:

1. Before answering any prompt that includes code or file contents, call
   `estimate_tokens` with the prompt + file contents and the active model.
2. If `input_tokens > 1500` OR more than one file is attached, call
   `optimize_context` and use the returned `optimized_files` instead of
   the originals. Quote the `message` field back to the user.
3. Before producing long-form responses, call `check_budget`. If `warning`
   is not `ok`, switch to a concise style or refuse the long response.
4. After the work is done, call `estimate_tokens` with `commit: true`.
```

The full version lives in [`src/prompts/system.md`](src/prompts/system.md).

---

## Architecture

```
src/
├── index.ts              # stdio entrypoint
├── server.ts             # tool registration (McpServer)
├── tools/
│   ├── estimateTokens.ts
│   ├── optimizeContext.ts
│   └── checkBudget.ts
└── utils/
    ├── tokenizer.ts      # Claude vs tiktoken routing
    ├── cost.ts           # per-model pricing table
    ├── chunker.ts        # Babel AST + blank-line fallback
    ├── matcher.ts        # keyword + symbol scoring
    ├── embeddings.ts     # local MiniLM via @huggingface/transformers
    └── budget.ts         # JSON state with proper-lockfile
test/
├── tokenizer.test.ts
├── matcher.test.ts
└── budget.test.ts
```

**Stack:** Node ≥18, TypeScript strict, ESM, `@modelcontextprotocol/sdk`, `zod` for schemas, `vitest` for tests.

---

## Development

```bash
npm run dev         # tsc --watch
npm test            # vitest run
npm run inspector   # launch MCP inspector against local build
```

Smoke-test via raw stdio:
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | node dist/index.js
```

---

## FAQ

**Does it send my code anywhere?**
No. Tokenizers run locally. Embeddings model is downloaded once from HuggingFace CDN and cached in `~/.cache/huggingface`; subsequent runs are fully offline.

**Will the model actually use these tools?**
Only if your `CLAUDE.md` (or system prompt) explicitly orders it to. Optional helpers get ignored. The wording in [`src/prompts/system.md`](src/prompts/system.md) is intentionally heavy-handed (`MUST`, numbered protocol) for that reason.

**Why not embeddings by default?**
First run downloads ~25MB and is slow. Keyword mode is good enough for most queries with code that has descriptive identifiers. Switch to `mode: "embeddings"` when query terms don't appear literally in the code.

**Can I use it with Cursor / Continue / Codex CLI?**
Yes — anything that supports MCP stdio servers. The `.mcp.json` schema is the same.

**Does pricing in `cost.ts` stay current?**
You'll need to update it as providers change pricing. PRs welcome.

---

## License

MIT © 2026
