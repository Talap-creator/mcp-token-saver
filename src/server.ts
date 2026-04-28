import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  estimateTokens,
  estimateTokensSchema,
} from "./tools/estimateTokens.js";
import { checkBudget, checkBudgetSchema } from "./tools/checkBudget.js";
import {
  optimizeContext,
  optimizeContextSchema,
} from "./tools/optimizeContext.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-token-saver",
    version: "0.1.0",
  });

  server.tool(
    "estimate_tokens",
    "Estimate token usage and cost of a prompt + optional files BEFORE sending. Call this before answering any large prompt.",
    estimateTokensSchema,
    estimateTokens,
  );

  server.tool(
    "optimize_context",
    "Reduce context size by selecting only chunks relevant to the query. Use the returned optimized_files INSTEAD of the originals when input_tokens is large.",
    optimizeContextSchema,
    optimizeContext,
  );

  server.tool(
    "check_budget",
    "Return today's remaining USD budget. Call before producing long responses.",
    checkBudgetSchema,
    checkBudget,
  );

  return server;
}
