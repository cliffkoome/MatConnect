import "server-only";
import type { Db } from "@/server/db";

/**
 * Tries to take the named lease for `ttlMs`. Returns a release function, or null if another
 * holder's lease is still live. Expired leases are taken over, so a crashed run can't wedge a job.
 *
 * The clock comes from the app (one `now` per call) rather than SQL `now()`, so the comparison is
 * consistent with how Prisma writes timestamps regardless of the database session's time zone.
 */
export async function acquireJobLock(db: Db, name: string, ttlMs: number, holder: string = crypto.randomUUID()) {
  const now = new Date();
  const until = new Date(now.getTime() + ttlMs);
  const acquired = await db.$executeRaw`
    INSERT INTO "job_locks" ("name", "locked_until", "locked_by", "updated_at")
    VALUES (${name}, ${until}, ${holder}, ${now})
    ON CONFLICT ("name") DO UPDATE
      SET "locked_until" = EXCLUDED."locked_until",
          "locked_by" = EXCLUDED."locked_by",
          "updated_at" = EXCLUDED."updated_at"
      WHERE "job_locks"."locked_until" < ${now}`;

  if (acquired === 0) return null;

  return async function release() {
    const releasedAt = new Date();
    await db.$executeRaw`
      UPDATE "job_locks" SET "locked_until" = ${releasedAt}, "updated_at" = ${releasedAt}
      WHERE "name" = ${name} AND "locked_by" = ${holder}`;
  };
}
