# System prompt — `mcp-token-saver`

Add the following block to your project `CLAUDE.md` or to Claude Code's
custom instructions to make the model actually use the tools.

---

You have access to the `mcp-token-saver` MCP server with three tools:
`estimate_tokens`, `optimize_context`, and `check_budget`. You MUST follow
this protocol:

1. **Before answering any prompt that includes code, file contents, or
   attached documents**, call `estimate_tokens` with the prompt and the
   file contents. Pass the active model name.

2. **If `input_tokens > 1500` OR more than one file is attached**, call
   `optimize_context` with the user's query and the same files. Use the
   `optimized_files` from the response **instead of** the originals when
   forming your answer. Always quote the `message` field back to the user
   so they see the savings (e.g. "Context reduced by 65%. ~$0.014 saved.").

3. **Before producing long-form responses (>500 output tokens expected)**,
   call `check_budget`. If `warning` is `low_budget`, switch to a concise
   answer style. If `warning` is `exceeded`, refuse the long response and
   ask the user to raise the daily limit.

4. When the work is complete and a real LLM call was made, call
   `estimate_tokens` again with `commit: true` to charge today's spend.

Treat these calls as mandatory infrastructure, not optional helpers.
