import { fetchUsage } from "../utils/anthropicUsage.js";
import { appendSnapshot, readHistory, UsageSnapshot } from "../utils/history.js";

export const usageForecastSchema = {};

export async function usageForecast() {
  const r = await fetchUsage();
  if (!r.ok) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: r.error }, null, 2) }],
    };
  }

  const now = Date.now();
  const current: UsageSnapshot = {
    ts: now,
    five_hour: r.data.five_hour?.utilization ?? null,
    five_hour_resets_at: r.data.five_hour?.resets_at ?? null,
    seven_day: r.data.seven_day?.utilization ?? null,
    seven_day_resets_at: r.data.seven_day?.resets_at ?? null,
  };
  await appendSnapshot(current).catch(() => {});

  const history = await readHistory(500);
  const summary = {
    five_hour: forecastBucket(history, current, "five_hour", "five_hour_resets_at"),
    seven_day: forecastBucket(history, current, "seven_day", "seven_day_resets_at"),
    fetched_at: new Date(now).toISOString(),
  };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
  };
}

function forecastBucket(
  history: UsageSnapshot[],
  current: UsageSnapshot,
  field: "five_hour" | "seven_day",
  resetField: "five_hour_resets_at" | "seven_day_resets_at",
) {
  const cur = current[field];
  const resetISO = current[resetField];
  if (cur == null) return null;

  const resetTs = resetISO ? Date.parse(resetISO) : null;

  // window: keep snapshots since the last reset (or last 60 minutes for 5h, last 24h for 7d)
  const defaultWindowMs = field === "five_hour" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const windowStart = resetTs
    ? Math.max(resetTs - (field === "five_hour" ? 5 : 7 * 24) * 60 * 60 * 1000, current.ts - defaultWindowMs)
    : current.ts - defaultWindowMs;

  const points = history.filter(
    (s) => s.ts >= windowStart && s[field] != null && (s[field] as number) <= cur,
  );
  if (points.length < 2) {
    return {
      current_pct: round1(cur),
      resets_at: resetISO,
      burn_rate_pct_per_hour: null,
      eta_to_100_pct_iso: null,
      will_hit_limit_before_reset: null,
      note: "not enough history yet — call again later for forecast",
    };
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const dtHours = (last.ts - first.ts) / 3_600_000;
  const dPct = (last[field] as number) - (first[field] as number);
  const rate = dtHours > 0 ? dPct / dtHours : 0;

  let etaISO: string | null = null;
  let willHit: boolean | null = null;
  if (rate > 0.01) {
    const hoursLeft = (100 - cur) / rate;
    etaISO = new Date(current.ts + hoursLeft * 3_600_000).toISOString();
    willHit = resetTs ? Date.parse(etaISO) < resetTs : null;
  } else {
    willHit = false;
  }

  return {
    current_pct: round1(cur),
    resets_at: resetISO,
    burn_rate_pct_per_hour: round1(rate),
    eta_to_100_pct_iso: etaISO,
    will_hit_limit_before_reset: willHit,
    samples_used: points.length,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
