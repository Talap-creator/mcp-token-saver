import { fetchUsage, RawUsageBucket } from "../utils/anthropicUsage.js";
import { appendSnapshot } from "../utils/history.js";

export const usageStatusSchema = {};

export async function usageStatus() {
  const r = await fetchUsage();
  if (!r.ok) return errorPayload(r.error);

  const u = r.data;
  await appendSnapshot({
    ts: Date.now(),
    five_hour: u.five_hour?.utilization ?? null,
    five_hour_resets_at: u.five_hour?.resets_at ?? null,
    seven_day: u.seven_day?.utilization ?? null,
    seven_day_resets_at: u.seven_day?.resets_at ?? null,
  }).catch(() => {});

  const summary = {
    subscription: r.subscription,
    rate_limit_tier: r.rate_limit_tier,
    five_hour: formatBucket(u.five_hour),
    seven_day: formatBucket(u.seven_day),
    seven_day_sonnet: formatBucket(u.seven_day_sonnet ?? undefined),
    extra_usage: u.extra_usage
      ? {
          enabled: u.extra_usage.is_enabled,
          monthly_limit: u.extra_usage.monthly_limit ?? null,
          used_credits: u.extra_usage.used_credits ?? null,
          utilization_pct: pct(u.extra_usage.utilization),
        }
      : null,
    fetched_at: new Date().toISOString(),
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
  };
}

function formatBucket(b: RawUsageBucket | undefined) {
  if (!b || b.utilization == null) return null;
  return { utilization_pct: pct(b.utilization), resets_at: b.resets_at ?? null };
}

function pct(v: number | null | undefined) {
  if (v == null) return null;
  return Math.round(v * 10) / 10;
}

function errorPayload(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
  };
}
