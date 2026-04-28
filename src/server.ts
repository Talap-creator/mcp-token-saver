import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { usageStatus, usageStatusSchema } from "./tools/usageStatus.js";
import { usageForecast, usageForecastSchema } from "./tools/usageForecast.js";
import { shouldProceed, shouldProceedSchema } from "./tools/shouldProceed.js";
import { usageDelta, usageDeltaSchema } from "./tools/usageDelta.js";
import { cacheStats, cacheStatsSchema } from "./tools/cacheStats.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-token-saver",
    version: "0.2.0",
  });

  server.tool(
    "usage_status",
    "Fetch real-time Claude.ai subscription usage (5h session and 7d weekly utilization, reset times, extra credits) from the same endpoint Claude Code's IDE bar uses. Reads OAuth token from ~/.claude/.credentials.json. Auto-logs to history.",
    usageStatusSchema,
    usageStatus,
  );

  server.tool(
    "usage_forecast",
    "Compute burn rate and ETA to 100% based on logged usage history. Tells you whether you'll hit the limit before the next reset.",
    usageForecastSchema,
    usageForecast,
  );

  server.tool(
    "should_proceed",
    "Decide whether to proceed with a task given current usage. Returns proceed/downgrade/abort. Call BEFORE producing large responses, doing huge file reads, or starting expensive operations.",
    shouldProceedSchema,
    shouldProceed,
  );

  server.tool(
    "usage_delta",
    "Track real cost of a single task. action='mark' saves baseline, action='measure' returns delta in % of session/weekly used. Replaces theoretical cost estimates with real ones.",
    usageDeltaSchema,
    usageDelta,
  );

  server.tool(
    "cache_stats",
    "Compute Anthropic prompt cache hit rate from the latest Claude Code session log. Low hit rate signals wasted tokens — usually caused by reordering tools or system prompt mid-session.",
    cacheStatsSchema,
    cacheStats,
  );

  return server;
}
