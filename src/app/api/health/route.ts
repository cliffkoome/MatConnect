import { db } from "@/server/db";
import { json } from "@/server/http/route";

export const dynamic = "force-dynamic";

/** Liveness + database reachability, for uptime checks and deploy smoke tests. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error("[health] database check failed", error);
    return json({ status: "degraded", database: "unreachable" }, 503);
  }
}
