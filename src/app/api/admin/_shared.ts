import { rateLimits } from "@/server/http/rate-limit";

/** Every /api/admin route: Admin role + the admin rate limit (as in the Express router). */
export const adminOnly = { auth: "Admin", rateLimit: rateLimits.admin } as const;
export const adminDashboard = { auth: "Admin", rateLimit: [rateLimits.admin, rateLimits.dashboard] } as const;
