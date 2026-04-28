import { z } from "zod";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const cacheStatsSchema = {
  project_dir: z.string().optional().describe("Project working directory. Defaults to process.cwd() of the MCP server."),
  last_n: z.number().int().positive().max(200).optional().describe("Number of recent assistant messages to consider. Default 20."),
};

const PROJECTS_ROOT = join(homedir(), ".claude", "projects");

export async function cacheStats({
  project_dir,
  last_n = 20,
}: {
  project_dir?: string;
  last_n?: number;
}) {
  const cwd = project_dir ?? process.cwd();
  const slug = "c-" + cwd.replace(/[\\/:]/g, "-").replace(/^c-/i, "");
  // Claude Code uses a specific slug. Try a few likely variants.
  const candidates = [
    "c--" + cwd.replace(/^[A-Za-z]:/, "").replace(/[\\/:]/g, "-"),
    slug,
  ];

  let dir: string | null = null;
  for (const c of candidates) {
    const p = join(PROJECTS_ROOT, c);
    try {
      await fs.access(p);
      dir = p;
      break;
    } catch {}
  }
  if (!dir) {
    // fallback: pick most recently modified project dir
    try {
      const all = await fs.readdir(PROJECTS_ROOT, { withFileTypes: true });
      const dirs = await Promise.all(
        all
          .filter((d) => d.isDirectory())
          .map(async (d) => {
            const full = join(PROJECTS_ROOT, d.name);
            const st = await fs.stat(full).catch(() => null);
            return { full, mtime: st?.mtimeMs ?? 0 };
          }),
      );
      dirs.sort((a, b) => b.mtime - a.mtime);
      dir = dirs[0]?.full ?? null;
    } catch {}
  }
  if (!dir) return errorPayload("No Claude Code project logs found.");

  const files = await fs.readdir(dir).catch(() => [] as string[]);
  const jsonl = files.filter((f) => f.endsWith(".jsonl"));
  if (jsonl.length === 0) return errorPayload(`No .jsonl session log in ${dir}`);

  const stats = await Promise.all(
    jsonl.map(async (f) => {
      const full = join(dir!, f);
      const st = await fs.stat(full).catch(() => null);
      return { full, mtime: st?.mtimeMs ?? 0 };
    }),
  );
  stats.sort((a, b) => b.mtime - a.mtime);
  const latest = stats[0]!.full;

  let raw: string;
  try {
    raw = await fs.readFile(latest, "utf8");
  } catch (err) {
    return errorPayload(`Failed to read ${latest}: ${(err as Error).message}`);
  }
  const lines = raw.split("\n").filter(Boolean);

  const samples: Array<{
    input: number;
    cache_creation: number;
    cache_read: number;
    output: number;
  }> = [];
  for (let i = lines.length - 1; i >= 0 && samples.length < last_n; i--) {
    try {
      const j = JSON.parse(lines[i]!);
      const u = j?.message?.usage;
      if (!u || u.input_tokens == null) continue;
      samples.push({
        input: u.input_tokens ?? 0,
        cache_creation: u.cache_creation_input_tokens ?? 0,
        cache_read: u.cache_read_input_tokens ?? 0,
        output: u.output_tokens ?? 0,
      });
    } catch {}
  }
  if (samples.length === 0) return errorPayload("No usage records in latest session log.");

  const totalIn = samples.reduce((a, s) => a + s.input + s.cache_creation + s.cache_read, 0);
  const totalRead = samples.reduce((a, s) => a + s.cache_read, 0);
  const totalCreate = samples.reduce((a, s) => a + s.cache_creation, 0);
  const totalFresh = samples.reduce((a, s) => a + s.input, 0);
  const totalOut = samples.reduce((a, s) => a + s.output, 0);
  const hitRate = totalIn > 0 ? totalRead / totalIn : 0;

  let warning: string | null = null;
  if (samples.length >= 5 && hitRate < 0.4) {
    warning = "Low cache hit rate. Cache likely invalidated frequently — avoid reordering tools/system prompt mid-session.";
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            session_log: latest,
            messages_analyzed: samples.length,
            cache_hit_rate_pct: Math.round(hitRate * 1000) / 10,
            tokens: {
              cache_read: totalRead,
              cache_creation: totalCreate,
              fresh_input: totalFresh,
              output: totalOut,
            },
            warning,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function errorPayload(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
  };
}
