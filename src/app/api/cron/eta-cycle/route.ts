import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { errorResponse, json } from "@/server/http/route";
import { runEtaCycle } from "@/server/jobs/eta-cycle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const CYCLE_SPACING_MS = 30_000;

/**
 * Runs the ETA cycle. Called by Vercel Cron (GET, `Authorization: Bearer $CRON_SECRET`) or any
 * external scheduler. Overlapping calls are harmless: the job lease makes extra runs skip.
 *
 * Cron schedules have one-minute granularity, so `?runs=2` runs a second cycle 30 s after the first
 * to keep the original 30-second cadence from a once-a-minute trigger.
 */
async function handler(req: Request) {
  if (!authorised(req.headers.get("authorization"), env().CRON_SECRET)) {
    return json({ message: "Unauthorized" }, 401);
  }
  const runs = Math.min(Math.max(Number(new URL(req.url).searchParams.get("runs")) || 1, 1), 2);
  try {
    const startedAt = Date.now();
    const reports = [await runEtaCycle()];
    for (let i = 1; i < runs; i++) {
      const wait = startedAt + i * CYCLE_SPACING_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      reports.push(await runEtaCycle());
    }
    return json({ runs: reports });
  } catch (error) {
    return errorResponse(error);
  }
}

export { handler as GET, handler as POST };
