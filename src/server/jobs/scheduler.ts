import "server-only";
import { runEtaCycle } from "./eta-cycle";

export const ETA_INTERVAL_MS = 30_000;

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * In-process scheduler for long-running Node deployments (`next start` on a VM/container, or the
 * standalone `npm run eta:worker`). Each run is scheduled after the previous one finishes, so runs
 * never overlap within a process; the database lease prevents overlap across processes.
 */
export function startEtaScheduler(intervalMs = ETA_INTERVAL_MS) {
  if (timer) return;
  console.info(`[eta-cycle] in-process scheduler started (every ${intervalMs / 1000}s)`);

  const tick = async () => {
    try {
      const report = await runEtaCycle();
      if (!report.skipped && report.errors) console.warn("[eta-cycle] completed with errors", report);
    } catch (error) {
      console.error("[eta-cycle] run failed", error);
    } finally {
      timer = setTimeout(tick, intervalMs);
      timer.unref?.();
    }
  };
  timer = setTimeout(tick, 1_000);
  timer.unref?.();
}

export function stopEtaScheduler() {
  clearTimeout(timer);
  timer = undefined;
}
