import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";

export interface BudgetState {
  daily_limit_usd: number;
  days: Record<string, number>;
}

const DEFAULT_LIMIT = Number(process.env.MCP_TOKEN_SAVER_DAILY_LIMIT ?? 5);

export function statePath(): string {
  return (
    process.env.MCP_TOKEN_SAVER_STATE ??
    join(homedir(), ".mcp-token-saver", "state.json")
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function ensureFile(path: string): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  try {
    await fs.access(path);
  } catch {
    const initial: BudgetState = { daily_limit_usd: DEFAULT_LIMIT, days: {} };
    await fs.writeFile(path, JSON.stringify(initial, null, 2));
  }
}

async function readState(path: string): Promise<BudgetState> {
  const raw = await fs.readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<BudgetState>;
  return {
    daily_limit_usd: parsed.daily_limit_usd ?? DEFAULT_LIMIT,
    days: parsed.days ?? {},
  };
}

export async function getState(): Promise<BudgetState> {
  const path = statePath();
  await ensureFile(path);
  return readState(path);
}

export async function addSpend(amountUsd: number): Promise<BudgetState> {
  const path = statePath();
  await ensureFile(path);
  const release = await lockfile.lock(path, { retries: 5 });
  try {
    const state = await readState(path);
    const day = today();
    state.days[day] = (state.days[day] ?? 0) + amountUsd;
    await fs.writeFile(path, JSON.stringify(state, null, 2));
    return state;
  } finally {
    await release();
  }
}

export function snapshot(state: BudgetState) {
  const day = today();
  const spent = state.days[day] ?? 0;
  const remaining = state.daily_limit_usd - spent;
  let warning: "ok" | "low_budget" | "exceeded" = "ok";
  if (remaining <= 0) warning = "exceeded";
  else if (remaining < state.daily_limit_usd * 0.2) warning = "low_budget";
  return {
    daily_limit_usd: state.daily_limit_usd,
    spent_today_usd: Number(spent.toFixed(6)),
    remaining_budget_usd: Number(remaining.toFixed(6)),
    warning,
  };
}
