import { z } from "zod";
import { fetchUsage } from "../utils/anthropicUsage.js";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const usageDeltaSchema = {
  action: z
    .enum(["mark", "measure"])
    .describe("'mark' saves a snapshot as the baseline. 'measure' returns the delta since the last mark."),
  label: z.string().optional().describe("Optional label for the marked baseline."),
};

const MARK_PATH =
  process.env.MCP_TOKEN_SAVER_DELTA_MARK ??
  join(homedir(), ".mcp-token-saver", "delta_mark.json");

interface Mark {
  ts: number;
  five_hour: number | null;
  seven_day: number | null;
  label?: string;
}

export async function usageDelta({ action, label }: { action: "mark" | "measure"; label?: string }) {
  const r = await fetchUsage();
  if (!r.ok) return errorPayload(r.error);
  const now: Mark = {
    ts: Date.now(),
    five_hour: r.data.five_hour?.utilization ?? null,
    seven_day: r.data.seven_day?.utilization ?? null,
    label,
  };

  if (action === "mark") {
    await fs.mkdir(dirname(MARK_PATH), { recursive: true });
    await fs.writeFile(MARK_PATH, JSON.stringify(now, null, 2), "utf8");
    return ok({ marked: now });
  }

  let mark: Mark | null = null;
  try {
    mark = JSON.parse(await fs.readFile(MARK_PATH, "utf8"));
  } catch {
    return errorPayload("No baseline. Call usage_delta with action='mark' first.");
  }
  const dt = (now.ts - mark!.ts) / 1000;
  const d5 = diff(now.five_hour, mark!.five_hour);
  const d7 = diff(now.seven_day, mark!.seven_day);
  return ok({
    label: mark!.label ?? null,
    elapsed_seconds: Math.round(dt),
    five_hour: { before: round1(mark!.five_hour), after: round1(now.five_hour), delta_pct: round1(d5) },
    seven_day: { before: round1(mark!.seven_day), after: round1(now.seven_day), delta_pct: round1(d7) },
  });
}

function diff(a: number | null, b: number | null) {
  if (a == null || b == null) return null;
  return a - b;
}
function round1(n: number | null) {
  if (n == null) return null;
  return Math.round(n * 10) / 10;
}
function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function errorPayload(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
  };
}
