import { z } from "zod";
import { fetchUsage } from "../utils/anthropicUsage.js";

export const shouldProceedSchema = {
  task_size: z
    .enum(["small", "medium", "large", "huge"])
    .describe("Rough size of the planned response. small ~<500 out tokens, medium ~2k, large ~8k, huge >8k or large file reads."),
  description: z.string().optional().describe("Free-text task description, only used for the explanation."),
};

const SIZE_COST_PCT = { small: 0.5, medium: 2, large: 6, huge: 12 } as const;

export async function shouldProceed({
  task_size,
  description,
}: {
  task_size: keyof typeof SIZE_COST_PCT;
  description?: string;
}) {
  const r = await fetchUsage();
  if (!r.ok) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { decision: "proceed", reason: `usage unknown (${r.error}) — proceeding without throttle` },
            null,
            2,
          ),
        },
      ],
    };
  }

  const five = r.data.five_hour?.utilization ?? 0;
  const seven = r.data.seven_day?.utilization ?? 0;
  const expected = SIZE_COST_PCT[task_size];
  const projected5h = five + expected;
  const projected7d = seven + expected;

  let decision: "proceed" | "downgrade" | "abort";
  let reason: string;

  if (projected7d >= 100 || projected5h >= 100) {
    decision = "abort";
    reason = `would exceed limit (5h ${five.toFixed(0)}%→${projected5h.toFixed(0)}%, 7d ${seven.toFixed(0)}%→${projected7d.toFixed(0)}%). Compress the answer or wait for reset.`;
  } else if (five >= 90 || seven >= 90 || projected5h >= 95) {
    decision = "downgrade";
    reason = `usage hot (5h ${five.toFixed(0)}%, 7d ${seven.toFixed(0)}%). Switch to Haiku or shorten response.`;
  } else if (five >= 75 && task_size === "huge") {
    decision = "downgrade";
    reason = `5h at ${five.toFixed(0)}% and task is huge — split into smaller steps or use Haiku.`;
  } else {
    decision = "proceed";
    reason = `ok (5h ${five.toFixed(0)}%, 7d ${seven.toFixed(0)}%, projected +${expected}%).`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            decision,
            reason,
            current: { five_hour_pct: round1(five), seven_day_pct: round1(seven) },
            projected: { five_hour_pct: round1(projected5h), seven_day_pct: round1(projected7d) },
            task_size,
            description,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
