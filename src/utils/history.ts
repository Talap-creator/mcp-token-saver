import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface UsageSnapshot {
  ts: number;
  five_hour: number | null;
  five_hour_resets_at: string | null;
  seven_day: number | null;
  seven_day_resets_at: string | null;
}

const HISTORY_PATH =
  process.env.MCP_TOKEN_SAVER_HISTORY ??
  join(homedir(), ".mcp-token-saver", "usage_history.jsonl");

export async function appendSnapshot(snap: UsageSnapshot): Promise<void> {
  await fs.mkdir(dirname(HISTORY_PATH), { recursive: true });
  await fs.appendFile(HISTORY_PATH, JSON.stringify(snap) + "\n", "utf8");
}

export async function readHistory(maxEntries = 500): Promise<UsageSnapshot[]> {
  let raw: string;
  try {
    raw = await fs.readFile(HISTORY_PATH, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter(Boolean);
  const slice = lines.slice(-maxEntries);
  const out: UsageSnapshot[] = [];
  for (const line of slice) {
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip corrupt line
    }
  }
  return out;
}
