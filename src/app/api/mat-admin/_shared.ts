import { rateLimits } from "@/server/http/rate-limit";

export const matAdminOnly = { auth: "MatAdmin", rateLimit: rateLimits.admin } as const;
export const matAdminDashboard = { auth: "MatAdmin", rateLimit: [rateLimits.admin, rateLimits.dashboard] } as const;
