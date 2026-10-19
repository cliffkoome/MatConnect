/**
 * Standalone ETA worker for platforms that run a separate worker process (Railway, Fly, Render…)
 * while the web app runs on serverless with ETA_CYCLE_MODE=cron or off.
 *
 *   npm run eta:worker
 */
import "dotenv/config";
import { startEtaScheduler, stopEtaScheduler } from "../src/server/jobs/scheduler";

startEtaScheduler();
// Keep the process alive (the scheduler's timers are unref'd so they don't block Next.js shutdown).
const keepAlive = setInterval(() => {}, 1 << 30);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.info(`[eta-worker] ${signal} received, stopping`);
    stopEtaScheduler();
    clearInterval(keepAlive);
    process.exit(0);
  });
}
