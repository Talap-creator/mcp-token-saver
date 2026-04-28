import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = join(tmpdir(), `mcp-token-saver-test-${Date.now()}.json`);
process.env.MCP_TOKEN_SAVER_STATE = tmp;
process.env.MCP_TOKEN_SAVER_DAILY_LIMIT = "1";

const { addSpend, getState, snapshot } = await import("../src/utils/budget.js");

describe("budget", () => {
  beforeEach(async () => {
    await fs.rm(tmp, { force: true });
  });

  afterAll(async () => {
    await fs.rm(tmp, { force: true });
  });

  it("creates state with default limit on first read", async () => {
    const state = await getState();
    expect(state.daily_limit_usd).toBe(1);
    expect(state.days).toEqual({});
  });

  it("addSpend accumulates and snapshot warns", async () => {
    await addSpend(0.5);
    const state = await addSpend(0.4);
    const s = snapshot(state);
    expect(s.spent_today_usd).toBeCloseTo(0.9, 5);
    expect(s.warning).toBe("low_budget");

    const next = await addSpend(0.2);
    expect(snapshot(next).warning).toBe("exceeded");
  });
});
