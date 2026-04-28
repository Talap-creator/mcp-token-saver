import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

export interface RawUsageBucket {
  utilization?: number | null;
  resets_at?: string | null;
}

export interface RawUsage {
  five_hour?: RawUsageBucket;
  seven_day?: RawUsageBucket;
  seven_day_sonnet?: RawUsageBucket | null;
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number | null;
    used_credits?: number | null;
    utilization?: number | null;
  };
}

export interface FetchResult {
  ok: true;
  data: RawUsage;
  subscription?: string;
  rate_limit_tier?: string;
}

export interface FetchError {
  ok: false;
  error: string;
}

export async function fetchUsage(): Promise<FetchResult | FetchError> {
  let creds: any;
  try {
    creds = JSON.parse(await readFile(CREDENTIALS_PATH, "utf8"));
  } catch (err) {
    return { ok: false, error: `Failed to read credentials: ${(err as Error).message}` };
  }
  const token = creds?.claudeAiOauth?.accessToken;
  if (!token) return { ok: false, error: "No accessToken — run 'claude login'." };
  const expiresAt = creds?.claudeAiOauth?.expiresAt;
  if (typeof expiresAt === "number" && expiresAt < Date.now()) {
    return { ok: false, error: "OAuth token expired — run 'claude login'." };
  }
  let res: Response;
  try {
    res = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "claude-cli/2.1.121 (external, vscode)",
        "x-app": "vscode",
      },
    });
  } catch (err) {
    return { ok: false, error: `Network error: ${(err as Error).message}` };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  const data = (await res.json()) as RawUsage;
  return {
    ok: true,
    data,
    subscription: creds?.claudeAiOauth?.subscriptionType,
    rate_limit_tier: creds?.claudeAiOauth?.rateLimitTier,
  };
}
