# mcp-token-saver

> Real-time Claude.ai/Codex subscription awareness for AI coding assistants. Surfaces your live `Session 5hr` and `Weekly 7day` utilization, forecasts when you'll hit the limit, gates expensive operations before they run, and measures real per-task cost — all without leaving your machine.

[![npm version](https://img.shields.io/npm/v/mcp-token-saver.svg)](https://www.npmjs.com/package/mcp-token-saver)
[![npm downloads](https://img.shields.io/npm/dm/mcp-token-saver.svg)](https://www.npmjs.com/package/mcp-token-saver)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org)

---

## Why

Claude Code, Cursor,Codex and friends burn through your subscription quietly. The IDE
sidebar shows `Session 5hr 75% / Weekly 7day 45%`, but **the model itself can't
see those numbers** — so it has no way to know it's about to push you over the
limit on a single big task.

`mcp-token-saver` exposes that information (and acts on it):

1. **`usage_status`** — reads your live Claude.ai utilization from the same
   private endpoint Claude Code uses (`/api/oauth/usage`).
2. **`usage_forecast`** — logs snapshots over time, computes burn rate, tells
   you whether you'll hit 100% before the next reset.
3. **`should_proceed`** — given a task size, decides `proceed` / `downgrade` /
   `abort` based on current usage. Replaces guesswork with a guard rail.
4. **`usage_delta`** — mark a baseline before a task, measure the real % of
   your session/weekly limit it consumed. Real cost, not estimates.
5. **`cache_stats`** — reads your Claude Code session log and computes the
   actual prompt-cache hit rate. Low hit rate = wasted tokens.

No telemetry, no API keys (uses your existing OAuth token), no remote services.

---

## Table of contents

- [Features](#features)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Tools API](#tools-api)
- [Auto-inject usage into every prompt](#auto-inject-usage-into-every-prompt)
- [Activating the protocol](#activating-the-protocol)
- [Architecture](#architecture)
- [Development](#development)
- [FAQ](#faq)
- [License](#license)

---

## Features

- **Live subscription numbers.** Same data as the Claude Code IDE bar — utilization %, reset timestamps, extra-credits balance.
- **Burn-rate forecast.** Logs each snapshot and computes pct-per-hour and ETA to 100%.
- **Pre-flight gating.** `should_proceed` blocks huge operations when usage is hot.
- **Real per-task cost.** `usage_delta` measures what a task actually consumed.
- **Cache observability.** `cache_stats` parses Claude Code's session JSONL to surface real cache hit rate.
- **Adaptive output compression.** Optional hook directive that tells the model to write tighter responses when usage gets hot (>60%), tersest when critical (>95%), and stay normal when cool. No always-on caveman-speak — only compresses when it matters.
- **Zero configuration.** Reads OAuth token from `~/.claude/.credentials.json`. If you've run `claude login`, you're done.
- **Local-only.** No telemetry. No external services. The only network call is to `api.anthropic.com` with your own token.

---

## How it works

```
┌──────────────────┐    "should I do this big task?"    ┌──────────────────┐
│  Claude Code     │  ────────────────────────────────▶ │ mcp-token-saver  │
│  (or any MCP     │                                    │  (stdio server)  │
│   client)        │  ◀───────────────────────────────  │                  │
└──────────────────┘    { decision: "downgrade",        └──────────────────┘
        │                 reason: "5h at 92%, switch          │
        │                 to Haiku or shorten" }              │
        │                                                     │
        │                                                ┌────┴──────────┐
        │                                                │ /api/oauth/   │
        │                                                │ usage         │
        │                                                │ (api.anthr…)  │
        │                                                └───────────────┘
        ▼
   downgrade / proceed                            usage_history.jsonl
   based on real limits                          ~/.mcp-token-saver/
```

The OAuth token comes from `~/.claude/.credentials.json`, written by
`claude login`. The endpoint is the same one Claude Code's IDE bar polls
(`anthropic-beta: oauth-2025-04-20`).

---

## Quick start

### 1. Add to Claude Code

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

### 4. Restart your MCP client

Reload the window. On the next prompt the model can see your real subscription usage.

---

## Tools API

### `usage_status`

Live snapshot of your Claude.ai subscription usage. Auto-logs to history.

**Input:** none.

**Output**
```json
{
  "subscription": "pro",
  "rate_limit_tier": "default_claude_ai",
  "five_hour":  { "utilization_pct": 75, "resets_at": "2026-04-28T23:20:00Z" },
  "seven_day":  { "utilization_pct": 45, "resets_at": "2026-05-03T18:00:00Z" },
  "seven_day_sonnet": null,
  "extra_usage": { "enabled": false, "monthly_limit": null, "used_credits": null, "utilization_pct": null },
  "fetched_at": "2026-04-28T19:26:28Z"
}
```

### `usage_forecast`

Burn-rate forecast based on the snapshot history written by `usage_status`.

**Input:** none.

**Output**
```json
{
  "five_hour": {
    "current_pct": 75,
    "resets_at": "2026-04-28T23:20:00Z",
    "burn_rate_pct_per_hour": 18.4,
    "eta_to_100_pct_iso": "2026-04-28T22:50:00Z",
    "will_hit_limit_before_reset": true,
    "samples_used": 12
  },
  "seven_day": { "current_pct": 45, "burn_rate_pct_per_hour": 0.8, "eta_to_100_pct_iso": null, "will_hit_limit_before_reset": false, "samples_used": 12 }
}
```

> Needs at least 2 snapshots in the current bucket to forecast — call `usage_status` periodically (or use the auto-inject hook below) to build history.

### `should_proceed`

Pre-flight check before producing a long response or doing a big read.

**Input**
| Field | Type | Description |
|---|---|---|
| `task_size` | `"small" \| "medium" \| "large" \| "huge"` | Rough output size. small ~<500 tok, medium ~2k, large ~8k, huge >8k. |
| `description` | `string` (optional) | Free-text label for the decision log. |

**Output**
```json
{
  "decision": "downgrade",
  "reason": "usage hot (5h 92%, 7d 47%). Switch to Haiku or shorten response.",
  "current": { "five_hour_pct": 92, "seven_day_pct": 47 },
  "projected": { "five_hour_pct": 98, "seven_day_pct": 53 },
  "task_size": "large"
}
```

`decision` is one of `proceed`, `downgrade`, `abort`. The model should treat this as a hard gate.

### `usage_delta`

Measure the real cost of a task in % of your subscription, not in fake dollars.

**Input**
| Field | Type | Description |
|---|---|---|
| `action` | `"mark" \| "measure"` | `mark` saves baseline; `measure` returns delta since baseline. |
| `label` | `string` (optional) | Tag for the baseline. |

**Output (action=measure)**
```json
{
  "label": "refactor-auth",
  "elapsed_seconds": 412,
  "five_hour": { "before": 71, "after": 78.5, "delta_pct": 7.5 },
  "seven_day": { "before": 44, "after": 45, "delta_pct": 1 }
}
```

### `cache_stats`

Real prompt-cache hit rate from Claude Code's session log.

**Input**
| Field | Type | Description |
|---|---|---|
| `project_dir` | `string` (optional) | Project working directory. Defaults to most recently modified project log. |
| `last_n` | `number` (optional, max 200) | Recent assistant messages to analyze. Default 20. |

**Output**
```json
{
  "session_log": "/.../553db191-....jsonl",
  "messages_analyzed": 20,
  "cache_hit_rate_pct": 96.4,
  "tokens": { "cache_read": 1564240, "cache_creation": 12810, "fresh_input": 38, "output": 6210 },
  "warning": null
}
```

A `warning` appears if hit rate <40%, which usually means the system prompt or tool list changed mid-session.

---

## Auto-inject usage into every prompt

To make the model **always** see your current usage without calling a tool,
register a `UserPromptSubmit` hook. Save this as `~/.claude/hooks/usage_status.js`:

```js
#!/usr/bin/env node
const fs = require("fs"), os = require("os"), path = require("path");
(async () => {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude/.credentials.json"), "utf8"));
    const t = c?.claudeAiOauth?.accessToken;
    if (!t || (c.claudeAiOauth.expiresAt && c.claudeAiOauth.expiresAt < Date.now())) return;
    const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
        "anthropic-beta": "oauth-2025-04-20",
        "x-app": "vscode",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) return;
    const u = await r.json();
    const pct = b => b?.utilization != null ? `${b.utilization.toFixed(0)}%` : "—";
    process.stdout.write(`[claude-usage] session(5h): ${pct(u.five_hour)} | weekly(7d): ${pct(u.seven_day)}\n`);

    // Adaptive output compression — hotter session = terser response.
    const hot = Math.max(u.five_hour?.utilization ?? 0, u.seven_day?.utilization ?? 0);
    let d = null;
    if (hot >= 95)      d = "ONE-LINE ANSWERS ONLY. Code or value, no prose.";
    else if (hot >= 80) d = "MINIMUM TOKENS. Code over prose. No preamble, no summary.";
    else if (hot >= 60) d = "Respond tersely. Drop filler, hedging, pleasantries.";
    if (d) process.stdout.write(`[claude-usage-directive] ${d}\n`);
  } catch {}
})();
```

The `[claude-usage-directive]` line is an **adaptive output-compression**
hint — it tells the model to write tighter responses when your session is
hot, and stay normal when it's cool. Add this rule to your CLAUDE.md so the
model treats it as binding:

> When a `[claude-usage-directive]` line appears in your context, treat it
> as a binding style override for the turn — drop filler, shorten
> explanation, prefer code over prose to the level it specifies.

Then in `~/.claude/settings.json`:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/usage_status.js\"", "timeout": 5 }] }
    ]
  }
}
```

The hook fails silently if the token is missing or the endpoint is down — it
will never block your prompt. Output is injected as additional context for the
next assistant turn.

---

## Activating the protocol

Models won't call optional tools without instruction. You have two options:

### Global (recommended) — `~/.claude/CLAUDE.md`

Paste the protocol below into `~/.claude/CLAUDE.md` (Claude Code's user-level
memory file). It's then loaded into every project automatically — you only
write it once, and the model uses the tools across all your repos.

### Per-project — `<repo>/CLAUDE.md`

If you only want the protocol in specific projects, paste it into the
project's `CLAUDE.md` instead.

### The protocol

```markdown
You have access to the `token-saver` MCP server with five tools:
`usage_status`, `usage_forecast`, `should_proceed`, `usage_delta`,
`cache_stats`. They expose real Claude.ai subscription utilization.
You MUST follow this protocol:

1. Before producing a long response or doing a large file/codebase read,
   call `should_proceed` with an honest `task_size` ("small" / "medium" /
   "large" / "huge"). If `decision: "downgrade"`, switch to a shorter
   answer or recommend Haiku. If `decision: "abort"`, refuse and tell the
   user to wait for the reset (quote `resets_at`).
2. For multi-step tasks, call `usage_delta` with `action: "mark"` at the
   start and `action: "measure"` at the end. Quote the real delta to the
   user (e.g. "this task burned 7.5% of your 5h session").
3. When the user asks how much they have left, when it resets, or "am I
   close to the cap" — call `usage_status` (current) or `usage_forecast`
   (with ETA).
4. Every ~10–20 turns call `cache_stats`. If `cache_hit_rate_pct < 40` or
   a `warning` is set, surface it to the user — something invalidated the
   prompt cache and they're paying full input on every turn.
5. If a tool returns "OAuth token expired", tell the user to run
   `claude login` and proceed without usage gating for this turn.
6. If a `[claude-usage]` line in your context shows `session(5h) >= 80%`,
   mention it before starting the task. Don't silently proceed into a
   large task on a hot session.

Treat these calls as mandatory infrastructure, not optional helpers.
```

---

## Architecture

```
src/
├── index.ts                  # stdio entrypoint
├── server.ts                 # tool registration (McpServer)
├── tools/
│   ├── usageStatus.ts        # live /api/oauth/usage call + history append
│   ├── usageForecast.ts      # burn-rate + ETA from history
│   ├── shouldProceed.ts      # gating decision: proceed/downgrade/abort
│   ├── usageDelta.ts         # mark/measure baseline diff
│   └── cacheStats.ts         # parses ~/.claude/projects/*.jsonl for cache hit rate
└── utils/
    ├── anthropicUsage.ts     # OAuth token reader + /api/oauth/usage fetch
    └── history.ts            # append/read ~/.mcp-token-saver/usage_history.jsonl
```

**Stack:** Node ≥18, TypeScript strict, ESM, `@modelcontextprotocol/sdk`, `zod` for input schemas.

State files (all under `~/.mcp-token-saver/`, override with env vars):
- `usage_history.jsonl` — append-only snapshot log (`MCP_TOKEN_SAVER_HISTORY`)
- `delta_mark.json` — current baseline for `usage_delta` (`MCP_TOKEN_SAVER_DELTA_MARK`)

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

**Is `/api/oauth/usage` an official Anthropic API?**
No. It's the same endpoint Claude Code's IDE sidebar uses internally
(`anthropic-beta: oauth-2025-04-20`). Not documented, may change without notice.

**Does it send my code anywhere?**
No. The only outbound call is to `api.anthropic.com/api/oauth/usage` with your
own OAuth token.

**Can the model actually use these tools without me prompting?**
Only if your `CLAUDE.md` (or system prompt) explicitly orders it to — see
[Activating the protocol](#activating-the-protocol). Optional helpers get ignored.

**What if my `claude login` token expires?**
The tools return `{ "error": "OAuth token expired — run 'claude login'." }`.
Re-run `claude login` to refresh.

**v0.1 had `estimate_tokens` / `optimize_context` / `check_budget` — where did they go?**
v0.2 dropped them. They were estimates and a fake local-USD counter that didn't
correspond to your real subscription. The new tools use real Anthropic numbers
instead. Pin to `mcp-token-saver@0.1.x` if you need the old behavior.

---

## License

MIT © 2026
