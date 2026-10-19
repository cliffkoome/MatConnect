import { rateLimits } from "@/server/http/rate-limit";
import { route } from "@/server/http/route";
import { getProfile } from "@/server/modules/auth/auth.service";

/** Kept for API compatibility: profile, but only for Matatu admins. Prefer GET /api/auth/me. */
export const GET = route({ auth: "MatAdmin", rateLimit: rateLimits.auth }, ({ user }) => getProfile(user.id));
