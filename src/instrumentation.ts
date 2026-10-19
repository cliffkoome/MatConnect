/**
 * Next.js instrumentation hook — runs once per server process.
 *
 * ETA_CYCLE_MODE:
 *   interval → run the ETA cycle every 30 s in this process (default when self-hosting)
 *   cron     → do nothing here; a scheduler calls /api/cron/eta-cycle (default on Vercel)
 *   off      → disabled
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const mode = process.env.ETA_CYCLE_MODE ?? (process.env.VERCEL ? "cron" : "interval");
  if (mode !== "interval") return;
  if (!process.env.DATABASE_URL) {
    console.warn("[eta-cycle] DATABASE_URL not set — in-process scheduler not started.");
    return;
  }

  const { startEtaScheduler } = await import("./server/jobs/scheduler");
  startEtaScheduler();
}
